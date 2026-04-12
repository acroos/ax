# Go CLI

The CLI is the primary data ingestion tool. It parses git history, GitHub PR data, and Claude Code sessions, computes metrics, and stores everything in SQLite. In team mode, it also pushes data to the Rails API.

Entry point: `cmd/ax/main.go` (Cobra-based).

## Commands

| Command | Purpose |
|---------|---------|
| `ax sync --repo .` | Full sync: parse all sources, compute metrics, finalize terminal PRs |
| `ax sync --sessions-only --repo .` | Re-parse Claude Code sessions only (lighter) |
| `ax report` | Print aggregate metrics for the current repo |
| `ax report --pr 42` | Print metrics for a specific PR |
| `ax status` | Show tracked repos, last sync times, watch status |
| `ax export --format json` | Export finalized PR metrics (json, jsonl, csv) |
| `ax export --aggregate` | Export repo-level aggregate metrics |
| `ax init` | Install Claude Code hooks + background polling |
| `ax init --live` | Also install mid-session sync hook (Stop hook) |
| `ax init --team <url> --api-key <key> --user "Name"` | Configure managed mode |
| `ax watch` | Foreground GitHub polling loop |
| `ax watch --once` | Single poll cycle |
| `ax watch install` / `uninstall` / `status` | Manage system-level polling job |
| `ax push --repo .` | Manually push local data to managed server |
| `ax dashboard` | Start the web dashboard (runs Next.js dev server on :3333) |

## Package Structure

```
internal/
  api/           Push payload types (PushPayload, PushResponse)
  config/        Team mode config (~/.ax/config.json)
  correlator/    Session-to-PR linking (4 confidence levels)
  db/            SQLite schema, migrations, queries, models
  export/        JSON/JSONL/CSV export of finalized metrics
  hooks/         Claude Code hook installation in ~/.claude/settings.json
  metrics/       Metric calculators (one file per metric area + tests)
  parsers/       Data extraction from git, GitHub, and sessions
  pricing/       Model-specific token cost tables
  push/          HTTP client for team server + payload extraction
  sync/          Orchestration: sync.go, finalize.go, watch.go
  ui/            Terminal output: spinners, colors, banners (lipgloss)
  watch/         System scheduling: launchd (macOS), cron (Linux)
```

## Parsers

All parsers shell out to external CLIs via `os/exec`. No SDK dependencies.

### GitParser (`internal/parsers/git.go`)
Wraps the `git` CLI. Extracts commits, diffs, branches, and remote URLs.

Key methods:
- `RemoteURL()` → origin URL
- `ListCommits()` / `CommitsOnBranch()` → parsed git log
- `DiffStatBetween(base, head)` → file-level additions/deletions
- `DefaultBranch()` → detects main/master
- `ParseGitHubRemote(url)` → extracts owner/repo from SSH or HTTPS URLs

### GitHubParser (`internal/parsers/github.go`)
Wraps the `gh` CLI. Requires `gh` to be installed and authenticated.

Key methods:
- `ListPRs(state, limit)` → all/open/closed/merged PRs
- `GetPRReviews(number)` → reviews via GraphQL
- `GetPRChecks(number)` → CI status checks
- `HasChangesRequested(reviews)` / `CIPassRate(checks)` → metric helpers

### SessionParser (`internal/parsers/claude_sessions.go`)
Reads Claude Code session files from `~/.claude/projects/<encoded-path>/*.jsonl`.

Extracts per session:
- Message counts (human/assistant), token usage (input, output, cache)
- Model used (majority vote), tool calls by type
- Files read/modified, bash commands with success/failure
- PR URLs, commit SHAs, referenced plan files

Returns `ParsedSession` structs.

## Sync Engine

The sync engine (`internal/sync/sync.go`) orchestrates the full ingestion pipeline. See [Data Flow](data-flow.md) for the complete step-by-step.

Key design decisions:
- **Upsert-based idempotency** — All writes use `ON CONFLICT ... DO UPDATE`. Re-running sync is always safe.
- **Phase-based metrics** — Phase 1 (GitHub data) runs first, Phase 2 (session data) runs after correlation, Phase 3 (plan analysis) runs last.
- **Weighted session metrics** — If a session correlates to N PRs, its cost/tokens/errors are divided by N.
- **Auto-push** — If team mode is configured, sync automatically pushes after computation.

### Finalization (`internal/sync/finalize.go`)
- `IsTerminalState()` — Checks if PR state is merged or closed
- `FinalizePR()` — Sets `metrics_finalized=1` and `finalized_at=CURRENT_TIMESTAMP`
- Once finalized, metrics are never overwritten

### Watch Polling (`internal/sync/watch.go`)
- `RunGitHubOnly()` — Polls all watched repos for PR state changes
- `RunGitHubOnlyForRepo()` — Polls a single repo
- Only fetches GitHub data (no session re-parsing)
- Detects terminal state transitions and finalizes metrics

## Session-to-PR Correlation

`internal/correlator/correlator.go` links sessions to PRs using four strategies (in descending confidence):

1. **Direct** — PR URL appears in session output
2. **Branch** — Session's working branch matches PR head branch
3. **Commit** — Commit SHAs from the session appear in the PR
4. **Heuristic** — Time-window overlap (fallback)

A single session can correlate to multiple PRs. Metrics are weighted inversely by correlation count.

## Hooks System

`internal/hooks/hooks.go` manages Claude Code hooks in `~/.claude/settings.json`.

- `Install()` — Adds a `SessionEnd` hook that runs `ax sync --repo <cwd>` after every Claude Code session
- `InstallStopHook()` — Adds a `Stop` hook for mid-session syncing (`ax sync --sessions-only`)
- `Uninstall()` / `IsInstalled()` — Remove or check hook presence
- Preserves existing settings — reads the full JSON, modifies only hook entries

## Watch System

`internal/watch/scheduler.go` installs background polling as a system job.

- **macOS**: Creates `~/Library/LaunchAgents/com.ax.watch.plist` running `ax watch --once` on an interval
- **Linux**: Adds a crontab entry with `ax-watch-auto` marker
- Logs to `/tmp/ax-watch.log`

## Push & Team Mode

### Configuration (`internal/config/`)
Team mode config lives at `~/.ax/config.json`:
```json
{
  "mode": "team",
  "server_url": "https://app.ax.dev",
  "api_key": "ax_k1_...",
  "user_name": "Your Name"
}
```

### Push Client (`internal/push/client.go`)
- `Push(payload)` → `POST /api/v1/push` with Bearer token
- `Ping()` → validates API key against server
- Retry logic: up to 2 attempts on 5xx errors

### Payload Extraction (`internal/push/extract.go`)
- `ExtractPayload()` → builds `api.PushPayload` from local SQLite data
- Converts `sql.Null*` types to pointers for JSON serialization

## Database Layer

See [Data Model](data-model.md) for full schema details.

Key patterns:
- `internal/db/db.go` — SQLite setup (WAL mode, foreign keys) + versioned migrations
- `internal/db/queries.go` — All query functions accept `DBTX` interface (works with `*sqlx.DB` or `*sqlx.Tx`)
- `internal/db/models.go` — Go structs mapping to SQLite tables

## Key Files

| File | Lines | Purpose |
|------|-------|---------|
| `cmd/ax/main.go` | ~1200 | All CLI commands and flags |
| `internal/sync/sync.go` | ~600 | Sync orchestration |
| `internal/sync/finalize.go` | ~200 | Metric finalization |
| `internal/sync/watch.go` | ~200 | GitHub-only polling |
| `internal/parsers/claude_sessions.go` | ~350 | Session JSONL parsing |
| `internal/parsers/github.go` | ~250 | GitHub data extraction |
| `internal/parsers/git.go` | ~200 | Git history parsing |
| `internal/correlator/correlator.go` | ~150 | Session-PR linking |
| `internal/db/queries.go` | ~350 | All database queries |
| `internal/metrics/output_quality.go` | ~150 | Phase 1 metric calculators |
| `internal/metrics/planning.go` | ~100 | Plan analysis |
| `internal/hooks/hooks.go` | ~150 | Claude Code hook management |
| `internal/watch/scheduler.go` | ~200 | System job installation |
