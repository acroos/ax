# Go CLI

The CLI is a thin client that parses Claude Code session data and pushes it to the AX managed service. It also handles initial setup (auth, hook installation).

All CLI code lives under `cli/`. Entry point: `cli/cmd/ax/main.go` (Cobra-based).

## Commands

| Command | Purpose |
|---------|---------|
| `ax init --api-key <key>` | Set up AX: validate server, save config, install Claude Code hooks |
| `ax init --uninstall` | Remove all AX hooks |
| `ax push --repo .` | Parse and push new session data for a single repo |
| `ax push --repo . --force` | Re-send all sessions, ignoring push history |
| `ax push --all` | Discover all repos and push new sessions for each |

## Package Structure

```
cli/
  cmd/ax/        CLI entry point (main.go)
  internal/
    api/         Push payload types (PushPayload, PushResponse, SessionData)
    bulk/        Repo discovery (from history.jsonl) and bulk push orchestration
    config/      Config management (~/.ax/config.json)
    hooks/       Claude Code hook installation in ~/.claude/settings.json
    metrics/     Metric calculator library (pure functions, used by Rails port)
    parsers/     Session data parsing + GitHub/git data types
    pricing/     Model-specific token cost tables
    push/        HTTP client for AX server
    state/       Push state tracking (which sessions already sent)
    ui/          Terminal output: spinners, colors, banners (lipgloss)
  Justfile       Build commands (just build, just test, etc.)
```

## Session Parser (`cli/internal/parsers/claude_sessions.go`)
Reads Claude Code session data from `~/.claude/projects/<encoded-path>/`. Supports two storage formats:
1. **Top-level JSONL files**: `<uuid>.jsonl` — the traditional format
2. **Directory-based sessions**: `<uuid>/subagents/agent-*.jsonl` — used when no top-level `.jsonl` exists (e.g. subagent-only sessions)

Extracts per session:
- Message counts (human/assistant), token usage (input, output, cache)
- Model used (majority vote), tool calls by type
- Files read/modified, bash commands with success/failure
- PR URLs, commit SHAs, referenced plan files

Returns `ParsedSession` structs. Also discovers sessions from Claude Code worktrees belonging to the same repo.

## Hooks System

`cli/internal/hooks/hooks.go` manages Claude Code hooks in `~/.claude/settings.json`.

- `Install()` — Adds a `SessionEnd` hook that runs `ax push --repo <cwd>` after every Claude Code session. Also removes stale AX hooks from other events (e.g. `Stop`).
- `Uninstall()` / `IsInstalled()` — Remove or check hook presence across all AX-managed events (`SessionEnd`, `Stop`)
- Handles worktree resolution — if the CWD is a worktree path (`<repo>/.claude/worktrees/<name>/`), resolves back to the main repo
- Preserves existing settings — reads the full JSON, modifies only hook entries

## Bulk Push (`cli/internal/bulk/`)

`ax push --all` discovers all repos from `~/.claude/history.jsonl` and pushes sessions for each.

**Discovery** (`discovery.go`):
1. Reads `~/.claude/history.jsonl` to get unique project paths
2. Resolves worktree paths (`/.claude/worktrees/<name>`) to parent repo roots
3. Runs `git remote get-url origin` to identify owner/repo
4. Groups project paths by owner/repo, deduplicates session files by basename
5. Filters out paths that don't exist or lack a git remote (logged as skipped)

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
- Retry logic: up to 2 attempts on 5xx errors

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
- `prompt_efficiency.go` — MessagesPerPR, IterationDepth, TokenCost
- `planning.go` — PlanCoverage, PlanDeviation, ScopeCreep

## Key Files

| File | Lines | Purpose |
|------|-------|---------|
| `cli/cmd/ax/main.go` | ~370 | CLI commands: init, push, push --all |
| `cli/internal/bulk/discovery.go` | ~170 | Repo discovery from history.jsonl |
| `cli/internal/bulk/push.go` | ~280 | Bulk push orchestration, progress, error logging |
| `cli/internal/parsers/claude_sessions.go` | ~350 | Session JSONL parsing |
| `cli/internal/hooks/hooks.go` | ~200 | Claude Code hook management |
| `cli/internal/push/client.go` | ~140 | HTTP client for server API |
| `cli/internal/state/state.go` | ~110 | Push state tracking per repo |
| `cli/internal/metrics/output_quality.go` | ~130 | Output quality metric calculators |
| `cli/internal/metrics/planning.go` | ~140 | Plan analysis |
