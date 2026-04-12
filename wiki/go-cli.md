# Go CLI

The CLI is a thin client that parses Claude Code session data and pushes it to the AX managed service. It also handles initial setup (auth, hook installation).

Entry point: `cmd/ax/main.go` (Cobra-based).

## Commands

| Command | Purpose |
|---------|---------|
| `ax init --api-key <key>` | Set up AX: validate server, save config, install Claude Code hooks |
| `ax init --uninstall` | Remove all AX hooks |
| `ax push --repo .` | Parse and push session data to the server |

## Package Structure

```
internal/
  api/           Push payload types (PushPayload, PushResponse)
  config/        Config management (~/.ax/config.json)
  hooks/         Claude Code hook installation in ~/.claude/settings.json
  metrics/       Metric calculator library (pure functions, used by Rails port)
  parsers/       Session data parsing + GitHub/git data types
  pricing/       Model-specific token cost tables
  push/          HTTP client for AX server
  ui/            Terminal output: spinners, colors, banners (lipgloss)
```

## Session Parser (`internal/parsers/claude_sessions.go`)
Reads Claude Code session files from `~/.claude/projects/<encoded-path>/*.jsonl`.

Extracts per session:
- Message counts (human/assistant), token usage (input, output, cache)
- Model used (majority vote), tool calls by type
- Files read/modified, bash commands with success/failure
- PR URLs, commit SHAs, referenced plan files

Returns `ParsedSession` structs. Also discovers sessions from Claude Code worktrees belonging to the same repo.

## Hooks System

`internal/hooks/hooks.go` manages Claude Code hooks in `~/.claude/settings.json`.

- `Install()` — Adds a `SessionEnd` hook that runs `ax push --repo <cwd>` after every Claude Code session. Also removes stale AX hooks from other events (e.g. `Stop`).
- `Uninstall()` / `IsInstalled()` — Remove or check hook presence across all AX-managed events (`SessionEnd`, `Stop`)
- Handles worktree resolution — if the CWD is a worktree path (`<repo>/.claude/worktrees/<name>/`), resolves back to the main repo
- Preserves existing settings — reads the full JSON, modifies only hook entries

## Push Client (`internal/push/client.go`)
- `Push(payload)` → `POST /api/v1/push` with Bearer token
- `Ping()` → validates API key against server
- `HealthCheck()` → checks server reachability (no auth required)
- Retry logic: up to 2 attempts on 5xx errors

## Configuration (`internal/config/`)
Config lives at `~/.ax/config.json`:
```json
{
  "api_key": "ax_k1_..."
}
```

The server URL is hardcoded as `config.DefaultServerURL` (`https://ax.up.railway.app`).

Written by `ax init`, read by `ax push`.

## Metrics Library (`internal/metrics/`)

Pure function metric calculators, kept as a Go library. These are being ported to Ruby for server-side computation. The Go versions may be removed once the port is complete.

- `output_quality.go` — PostOpenCommits, FirstPassAccepted, CISuccessRate, HasTestFiles, DiffChurn, LineRevisits
- `agent_behavior.go` — SelfCorrectionRate, ContextEfficiency, ErrorRecoveryAttempts
- `prompt_efficiency.go` — MessagesPerPR, IterationDepth, TokenCost
- `planning.go` — PlanCoverage, PlanDeviation, ScopeCreep

## Key Files

| File | Lines | Purpose |
|------|-------|---------|
| `cmd/ax/main.go` | ~250 | CLI commands: init and push |
| `internal/parsers/claude_sessions.go` | ~350 | Session JSONL parsing |
| `internal/hooks/hooks.go` | ~200 | Claude Code hook management |
| `internal/push/client.go` | ~140 | HTTP client for server API |
| `internal/metrics/output_quality.go` | ~130 | Output quality metric calculators |
| `internal/metrics/planning.go` | ~140 | Plan analysis |
