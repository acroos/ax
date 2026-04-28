# Go CLI

The CLI is a thin client that parses session data from all installed agents (Claude Code, Copilot CLI, Cursor CLI) and pushes it to the AX managed service. It also handles initial setup (auth, hook installation).

All CLI code lives under `cli/`. Entry point: `cli/cmd/ax/main.go` (Cobra-based).

## Commands

| Command | Purpose |
|---------|---------|
| `ax init --api-key <key>` | Set up AX: validate server, save config, install Claude Code hooks and Copilot CLI hooks when Copilot state exists |
| `ax init --uninstall` | Remove all AX hooks |
| `ax push --repo .` | Parse and push new session data for a single repo |
| `ax push --repo . --force` | Re-send all sessions, ignoring push history |
| `ax push --all` | Discover all repos and push new sessions for each |

## Package Structure

```
cli/
  cmd/ax/        CLI entry point (main.go)
  internal/
    agents/      Agent registry + Provider interface
      registry.gen.go       codegen output — DO NOT EDIT
      provider.go           Provider interface + DiscoveryTarget/SessionLocator types
      providers.go          RegisteredProviders() — assembles all Provider impls
      claude/               Claude Code provider (discovery, parser, tools)
      copilot/              Copilot CLI provider (discovery, parser, workspace)
      cursor/               Cursor CLI provider (discovery, parser, applypatch)
    api/         Push payload types (PushPayload, PushResponse, SessionData)
    bulk/        Repo discovery (from history.jsonl) and bulk push orchestration
    config/      Config management (~/.ax/config.json)
    hooks/       Hook installer interface + per-agent installers
      installer.go          Installer interface + Scope enum
      installers.go         RegisteredInstallers()
      pushcommand/          Shared bash one-liner generator
      claude/               Claude Code hook installer (~/.claude/settings.json)
      copilot/              Copilot CLI hook installer (.github/hooks/session-end.json)
      cursor/               Cursor CLI hook installer (~/.cursor/hooks.json)
    metrics/     Metric calculator library (pure functions, used by Rails port)
    parsers/     ParsedSession type + GitHub/git data types (shared across agents)
    pricing/     Model-specific context window lookup
    push/        HTTP client for AX server
    state/       Push state tracking (which sessions already sent)
    ui/          Terminal output: spinners, colors, banners (lipgloss)
  Justfile       Build commands (just build, just test, etc.)
```

## Session Parsers (Agent Providers)

Session discovery and parsing are handled by the `agents.Provider` interface (`cli/internal/agents/provider.go`). Each agent has a dedicated package under `cli/internal/agents/<id>/` implementing `DiscoverSessions()` and `Parse()`. The `ParsedSession` type lives in `cli/internal/parsers/session.go` (shared across all providers).

### Claude Code (`cli/internal/agents/claude/`)
Reads Claude Code session data from `~/.claude/projects/<encoded-path>/`. Supports two storage formats:
1. **Top-level JSONL files**: `<uuid>.jsonl` — the traditional format
2. **Directory-based sessions**: `<uuid>/subagents/agent-*.jsonl` — used when no top-level `.jsonl` exists (e.g. subagent-only sessions)

Extracts per session:
- Message counts (human/assistant), token usage (input, output, cache)
- Model used (majority vote), tool calls by type
- Tool call categorization: total, Agent (subagent), Skill (slash commands), MCP (custom tools with `mcp__` prefix)
- Peak context tokens: highest `(input + cache_creation + cache_read)` across any single message
- Peak context percentage: `peak_context_tokens / model_max_context` (using model-specific limits from `pricing.LookupMaxContext`)
- Files read/modified, bash commands with success/failure
- PR URLs, commit SHAs, referenced plan files

Returns `ParsedSession` structs with `agent_type = "claude_code"`. Also discovers sessions from Claude Code worktrees belonging to the same repo.

### Copilot CLI (`cli/internal/agents/copilot/`)
Reads Copilot CLI session directories from `~/.copilot/session-state/<uuid>/`. The parser uses `workspace.yaml` for repo metadata and `events.jsonl` for the event stream. IDE-only workspaces without `events.jsonl` are skipped.

Extracts per session:
- Message/turn counts from user and assistant events
- Token usage from `session.shutdown.data.modelMetrics`
- Majority model, tool calls, file read/modify counts
- PR URLs and commit SHAs observed in tool results

Returns `ParsedSession` structs with `agent_type = "copilot_cli"`.

### Cursor CLI (`cli/internal/agents/cursor/`)
Reads Cursor workspace state from `~/.cursor/workspaces/<uuid>/`. Uses `repo.json` and `.workspace-trusted` to resolve the workspace path, then `GitRemoteFn` to derive `owner/repo` from the local path. Parses `applypatch.jsonl` for per-event session data.

Extracts per session:
- Turn count (alternating user/assistant events), tool calls, files read/modified
- Commit SHAs from tool results (for correlation)
- `extras.commit_attribution` and `extras.conversation_summary` when present

Token fields (`input_tokens`, `output_tokens`, `cache_*`) are `nil` — Cursor does not expose token counts locally. The capability matrix in `config/agents.yaml` declares `input_tokens: false` for `cursor_cli`, so the server and dashboard handle this correctly.

Returns `ParsedSession` structs with `agent_type = "cursor_cli"`.

## Hooks System

Hook installation is handled by the `hooks.Installer` interface (`cli/internal/hooks/installer.go`). Each agent has a dedicated installer under `cli/internal/hooks/<id>/`. The `ax init` command iterates `hooks.RegisteredInstallers()` — no per-agent logic in the orchestration loop.

A shared `cli/internal/hooks/pushcommand/` package generates the parameterized bash one-liner used by all agent hook files.

**Claude Code** (`cli/internal/hooks/claude/installer.go`) — writes to `~/.claude/settings.json` (user scope). Handles worktree resolution (CWD is a worktree path → resolves back to main repo). Preserves existing settings; only modifies hook entries.

**Copilot CLI** (`cli/internal/hooks/copilot/installer.go`) — writes `.github/hooks/session-end.json` (repo scope). Conservative: AX writes only its own hook file and refuses to overwrite a non-AX hook.

**Cursor CLI** (`cli/internal/hooks/cursor/installer.go`) — writes `~/.cursor/hooks.json` (user scope, default) or `<repo>/.cursor/hooks.json` (repo scope, opt-in via `--scope repo`). See [Setup — Cursor](../docs/setup.md#cursor-cli) for the resulting file shape.

## Bulk Push (`cli/internal/bulk/`)

`ax push --all` discovers all repos from Claude Code history and Copilot CLI workspaces, then pushes sessions for each.

**Discovery** (`discovery.go`):
1. Reads `~/.claude/history.jsonl` to get unique project paths
2. Resolves worktree paths (`/.claude/worktrees/<name>`) to parent repo roots
3. Runs `git remote get-url origin` to identify owner/repo
4. Adds Copilot-only repos from `workspace.yaml.repository` when present
5. Groups project paths by owner/repo, deduplicates session files by session ID
6. Filters out paths that don't exist or lack a git remote (logged as skipped)

**Push** (`push.go`):
- Sessions are chunked into batches of 100 to stay under the 10MB payload limit
- Repos are pushed in parallel (default 3 workers)
- ANSI-based progress display updates in place (falls back to simple output for non-TTY)
- Failed chunks (after the push client's built-in retry) are collected and written to `~/.ax/logs/bulk-push-<timestamp>.log`

The server upserts sessions by ID, so re-pushing is safe — no data duplication.

## Push State Tracking (`cli/internal/state/`)

Both `ax push --repo` and `ax push --all` track which sessions have already been pushed to avoid re-sending. State is stored per-repo at `~/.ax/state/<owner>-<repo>.json` as a set of pushed session IDs.

On each push, only sessions not already in the state file are parsed and sent. After a successful push, the state file is updated with the newly pushed IDs. This reduces hook-triggered pushes from O(all sessions) to O(1 new session).

- `Load(ownerRepo)` — Read state, returns empty state if file missing
- `Save(ownerRepo, state)` — Write state to disk
- `FilterNewSessionFiles(files, pushedSet)` — Return only files not in pushed set

Use `ax push --force` to bypass state and re-send all sessions.

## Push Client (`cli/internal/push/client.go`)
- `Push(payload)` → `POST /api/v1/push` with Bearer token
- `Ping()` → validates API key via `GET /api/v1/ping`
- `HealthCheck()` → checks server reachability (no auth required)
- Retry logic: up to 2 attempts on 5xx errors, up to 3 retries on 429 (rate limit) with `Retry-After` backoff
- `OnRateLimit` callback notifies callers before each rate-limit sleep
- `WithOnRateLimit(fn)` returns a client clone with a per-caller callback (used by bulk push for per-repo progress)

## Configuration (`cli/internal/config/`)
Config lives at `~/.ax/config.json`:
```json
{
  "api_key": "ax_k1_..."
}
```

The server URL is hardcoded as `config.DefaultServerURL` (`https://ax.up.railway.app`).

Written by `ax init`, read by `ax push`.

## Metrics Library (`cli/internal/metrics/`)

Pure function metric calculators, kept as a Go library. These are being ported to Ruby for server-side computation. The Go versions may be removed once the port is complete.

- `output_quality.go` — PostOpenCommits, FirstPassAccepted, CISuccessRate, HasTestFiles, DiffChurn, LineRevisits
- `prompt_efficiency.go` — MessagesPerPR, IterationDepth
- `planning.go` — PlanCoverage, PlanDeviation, ScopeCreep

## Adding a new agent

1. Add the agent's entry to `config/agents.yaml` (use existing entries as templates). Declare every `field_keys` and `metric_slugs` key — no implicit defaults.
2. Run `just codegen-agents` and commit the regenerated `*.gen.*` files (`registry.gen.go`, `agent_registry.rb`, `agents.gen.ts`).
3. Implement `cli/internal/agents/<id>/{provider.go, discovery.go, parser.go, tools.go}` — the `agents.Provider` interface.
4. Implement `cli/internal/hooks/<id>/installer.go` (skip if the agent has no hook system) — the `hooks.Installer` interface.
5. Register both in `cli/internal/agents/providers.go` (`RegisteredProviders()`) and `cli/internal/hooks/installers.go` (`RegisteredInstallers()`).
6. Add tests in `cli/internal/agents/<id>/<id>_test.go` and (if applicable) `cli/internal/hooks/<id>/installer_test.go`.
7. Update `docs/setup.md` with the install instructions for the new agent.

## Key Files

| File | Purpose |
|------|---------|
| `cli/cmd/ax/main.go` | CLI commands: init, push, push --all |
| `config/agents.yaml` | Agent registry + capability matrix (edit to add an agent) |
| `cli/internal/agents/provider.go` | `Provider` interface definition |
| `cli/internal/agents/providers.go` | `RegisteredProviders()` — add new agents here |
| `cli/internal/agents/registry.gen.go` | Generated Go constants — DO NOT EDIT |
| `cli/internal/agents/claude/provider.go` | Claude Code provider impl |
| `cli/internal/agents/copilot/provider.go` | Copilot CLI provider impl |
| `cli/internal/agents/cursor/provider.go` | Cursor CLI provider impl |
| `cli/internal/hooks/installer.go` | `Installer` interface definition |
| `cli/internal/hooks/installers.go` | `RegisteredInstallers()` — add new agents here |
| `cli/internal/hooks/pushcommand/script.go` | Shared bash one-liner generator |
| `cli/internal/bulk/discovery.go` | Repo discovery from history.jsonl |
| `cli/internal/bulk/push.go` | Bulk push orchestration, progress, error logging |
| `cli/internal/parsers/session.go` | `ParsedSession` type (shared across all providers) |
| `cli/internal/push/client.go` | HTTP client for server API |
| `cli/internal/state/state.go` | Push state tracking per repo |
