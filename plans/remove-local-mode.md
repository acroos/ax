# Plan: Remove Local Mode

**ADR:** [014 — Remove Local Mode](../docs/decisions/014-remove-local-mode.md)
**Date:** 2026-04-12

## Overview

Remove local mode from AX, making managed mode (`app.ax.dev`) the only way to use the tool. The CLI becomes a thin client, the dashboard becomes API-only, and metric computation moves entirely to the Rails backend.

## Phases

### Phase 0: Rails — Server-side file-level data fetching

Three metrics currently depend on data the git parser extracts locally that GitHub webhooks don't provide:

| Metric | Data needed | Why webhooks don't cover it |
|--------|------------|----------------------------|
| `diff_churn_lines` | Per-commit additions + net diff between base/head | Webhooks only give aggregate PR stats |
| `has_tests` | File paths per commit | Webhooks only give file count, not paths |
| `line_revisit_rate` | File paths across PRs over time | Webhooks are per-event, no historical file data |

**Solution**: Fetch this data from the GitHub API server-side at PR finalization (merge/close). This is the right trigger because metrics are only computed for terminal PRs — no reason to fetch per-commit file data for PRs that may never merge.

**Implementation:**
- Add a `GithubDataFetcher` service (or extend existing webhook handler) that runs when a PR reaches terminal state
- On `pull_request` merged/closed webhook:
  1. `GET /repos/{owner}/{repo}/pulls/{number}/files` → file paths for test detection + line revisit tracking
  2. `GET /repos/{owner}/{repo}/pulls/{number}/commits` → per-commit stats for diff churn
- Store file paths on commits (add `file_paths` array column or join table to commits)
- Store PR-level file list for line revisit rate computation
- Update metric finalization to use this server-fetched data instead of expecting it in the push payload

**Why at finalization, not on every push:**
- Avoids unnecessary GitHub API calls for WIP PRs
- Data only matters for finalized metrics
- Simpler error handling — one fetch, one computation

### Phase 1: Go CLI — Remove local-only packages

Delete entire packages that exist solely to support local mode:

| Package | Purpose | Lines (approx) |
|---------|---------|-----------------|
| `internal/sync/` | Orchestrates local parsing + metric computation + SQLite writes | ~1,100 |
| `internal/watch/` | GitHub polling loop + system scheduling (launchd/cron) | ~300 |
| `internal/hooks/` | Installs Claude Code hooks that trigger `ax sync` locally | ~200 |
| `internal/export/` | Reads finalized PRs from SQLite, formats as JSON/CSV/JSONL | ~400 |

Also remove:
- `internal/db/db.go` — SQLite schema, migrations, `Open()`, `DefaultDBPath()`. Keep `models.go` (shared types) and evaluate whether `queries.go` is still needed.
- `internal/db/db_test.go` — all tests use temp SQLite files

### Phase 2: Go CLI — Strip local-only commands

Remove or gut these commands in `cmd/ax/main.go`:

| Command | Action |
|---------|--------|
| `ax sync` | **Remove entirely** |
| `ax dashboard` | **Remove entirely** |
| `ax report` | **Remove entirely** (dashboard replaces it) |
| `ax status` | **Remove entirely** (no local state to report) |
| `ax export` | **Remove entirely** (API endpoint replaces it) |
| `ax watch` (+ subcommands) | **Remove entirely** |
| `ax init` | **Keep**, but remove local mode path. Always requires server connection. Rewrite hook installation — hooks now push session data to `app.ax.dev` instead of running `ax sync`. |
| `ax push` | **Keep** — manual trigger to push session data. Useful for backfilling or debugging. |

Remove helper functions: `openDB()`, `printRepoReport()`, `printPRReport()`, `runWatchLoop()`, `runWatchOnce()`, `findDashboardDir()`, etc.

### Phase 3: Go CLI — Simplify config and remaining packages

- **`internal/config/`**: Remove `Mode` field and `"local"` default. All config fields (`ServerURL`, `APIKey`, `UserName`) become required. `ax init` writes them.
- **`internal/push/extract.go`**: Remove (reads from SQLite). Keep `client.go` (HTTP client for API).
- **`internal/parsers/`**: Remove `git.go` and `github.go` — the server fetches all git/GitHub data via the GitHub API (see Phase 0). Keep `claude_sessions.go` — the CLI still parses session data locally and pushes it to the server. Remove `plans.go` (only used by sync).
- **`internal/metrics/`**: Keep as a Go library (pure functions). These will be ported to Ruby as part of Phase 0 (server-side metric computation). After porting, evaluate whether the Go versions are still needed.
- **`internal/pricing/`**: Same as metrics — port to Ruby, then evaluate.
- **`internal/correlator/`**: Remove — correlation moves server-side (the server has both session and PR data).

### Phase 4: Dashboard — Remove SQLite / dual-mode branching

- **`dashboard/src/lib/db.ts`**: Remove `isAPIMode()`, `getDb()`, all sync SQLite functions, `better-sqlite3` import. Keep only `fetchAPI()` and async query functions.
- **`dashboard/src/middleware.ts`**: Remove the `if (!process.env.AX_API_URL)` early-return branch. Always enforce auth.
- **`dashboard/src/app/layout.tsx`**: Sidebar currently uses sync `listRepos()` (SQLite). Convert to async, fetch from API.
- **All page components**: Remove any remaining `isAPIMode()` branches. Always use async API functions.
- **`package.json`**: Remove `better-sqlite3` dependency.
- **Local-only routes** (`/` overview with sparklines, non-org-scoped `/prs`, `/compare`): Either remove or redirect to org-scoped equivalents (`/{slug}/prs`, `/{slug}/compare`).

### Phase 5: Build & distribution cleanup

- **`go:embed`**: Remove the static dashboard embedding from the Go binary. The dashboard is now hosted, not embedded.
- **GoReleaser / Makefile**: Remove the dashboard build step from the release pipeline. The Go binary no longer includes dashboard assets.
- **Homebrew formula**: Update — the binary is now much smaller and simpler.
- **`go.mod`**: Remove SQLite driver (`modernc.org/sqlite`), `sqlx`, and any other dependencies that were only used by local mode.

### Phase 6: Documentation & project updates

- **`CLAUDE.md`**: Rewrite to reflect managed-only architecture. Remove all references to local mode, SQLite, `ax sync`, `ax dashboard`, embedded dashboard, dual-mode.
- **`docs/decisions/003-target-scope.md`**: Mark as superseded by ADR-014.
- **`docs/decisions/007-dashboard-packaging.md`**: Mark as superseded by ADR-014.
- **`docs/team-setup.md`**: Rename/rewrite as the primary setup guide (no longer "team" specific).
- **`wiki/`**: Update all pages referencing local mode, SQLite, dual-mode architecture.
- **`README.md`**: Rewrite for managed-only flow.

## Ordering & Dependencies

Three independent streams, all starting simultaneously:

```
Stream A: Phase 0 (Rails: server-side file data + metrics)  ──────┐
Stream B: Phase 1 → 2 → 3 (CLI: delete → strip → simplify)  ─────┤──→ Phase 5 (build) → Phase 6 (docs)
Stream C: Phase 4 (Dashboard: remove SQLite/dual-mode)  ──────────┘
```

**Within each stream:**
- Stream A is a single phase (Phase 0).
- Stream B is sequential — Phase 1 (delete packages) before Phase 2 (strip commands) before Phase 3 (simplify remaining). Each step must leave the build passing.
- Stream C is a single phase (Phase 4).

**Cross-stream dependency (deployment, not development):**
- Phase 0 must be **deployed** before the Phase 1-3 CLI is **released**. The server must handle all metrics server-side before users lose CLI-side metric computation. But the code changes can be developed in parallel — just gate the CLI release on Phase 0 being live.
- Phase 4 (dashboard) has no dependency on Phases 0-3. It can be developed, merged, and deployed independently.

**After all streams complete:**
- Phase 5 (build cleanup) — remove `go:embed`, SQLite deps, dashboard build step from release pipeline.
- Phase 6 (docs) — rewrite CLAUDE.md, wiki, README, mark superseded ADRs.

## Verification

After each phase:
- `go build ./...` passes (Phases 1-3, 5)
- `go test ./...` passes with remaining tests (Phases 1-3)
- `npm run build` passes in `dashboard/` (Phase 4)
- `bundle exec rspec` passes in `server/` (should be unaffected)
- No references to removed packages/functions remain (grep for `internal/sync`, `internal/watch`, etc.)

## Risk & Rollback

- **Risk**: Users relying on local mode lose functionality. **Mitigation**: Announce deprecation, keep the last local-mode-capable version tagged.
- **Risk**: CLI becomes so thin it's unclear why it exists. **Mitigation**: CLI still handles `ax init` (auth setup + hook installation) and `ax push` (manual data sync). Evaluate whether additional convenience commands are warranted.
- **Rollback**: Git revert. No data migrations involved — this is purely code removal.
