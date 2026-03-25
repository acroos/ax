# AX — Agentic Coding DX Metrics

## What is this?

AX is a CLI + web dashboard that measures developer experience for agentic coding workflows. It analyzes git history, GitHub PR data, and Claude Code session data to surface actionable metrics about how effectively engineers work with AI coding agents.

## Architecture

- **Go** — CLI binary and core engine (`cmd/ax/`, `internal/`)
- **TypeScript/Next.js** — Dashboard (`dashboard/`, not yet built)
- **SQLite** — Local data storage at `~/.ax/ax.db`

```
cmd/ax/              CLI entry point (cobra)
internal/
  db/                SQLite schema, migrations, queries, models
  parsers/
    git.go           Git log/diff/blame parser via os/exec
    github.go        GitHub PR/review/CI parser via gh CLI
  metrics/
    output_quality.go  Phase 1 metric calculators
  correlator/        Session-to-PR correlation (Phase 2)
  sync/
    sync.go          Orchestrates data ingestion + metric computation
dashboard/           Next.js web dashboard (Phase 2)
docs/
  decisions/         Architecture Decision Records (ADRs)
  metrics/           Per-metric documentation (16 files)
plans/               Project planning artifacts
```

## Build & Test

```bash
make build           # Build binary to bin/ax
make test            # Run all tests
go test ./... -v     # Verbose test output
make fmt             # Format code
make lint            # Lint (requires golangci-lint)
```

## Key Commands

```bash
ax sync --repo .     # Ingest git + GitHub data for current repo
ax report            # Print aggregate metrics
ax report --pr 42    # Print metrics for a specific PR
ax status            # Show tracked repos and last sync time
```

## Build Phases

- **Phase 1** (current): Git/GitHub-only metrics + CLI — post-open commits, first-pass acceptance rate, CI success rate, test coverage, diff churn, line revisit rate
- **Phase 2**: Claude Code session metrics + dashboard — messages per PR, iteration depth, self-correction rate, context efficiency, error recovery efficiency, token cost per PR, unmerged token spend
- **Phase 3**: Plan analysis + hooks — plan-to-implementation coverage, plan deviation score, scope creep detection

## Decisions

All architectural decisions are documented in `docs/decisions/`. Reference these when working in the related area:

- [001 — Metrics Selection](docs/decisions/001-metrics-selection.md): 16 metrics across 4 categories. Check this before adding or changing metrics.
- [002 — Form Factor](docs/decisions/002-form-factor.md): CLI + web dashboard. Don't build a plugin-only solution.
- [003 — Target Scope](docs/decisions/003-target-scope.md): Open source with a local → team → managed service path.
- [004 — CLI Language](docs/decisions/004-cli-language.md): Go for CLI, TypeScript for dashboard only.
- [005 — Session Ingestion](docs/decisions/005-session-ingestion-strategy.md): Claude Code hooks for team data collection. Relevant when building `ax init` or `ax push`.
- [006 — UX Philosophy](docs/decisions/006-ux-philosophy.md): Linear-inspired, dark mode first, inline metric context. **Read this before any dashboard work.**
- [007 — Dashboard Packaging](docs/decisions/007-dashboard-packaging.md): Embedded static build via `go:embed` for users, `npm run dev` for contributors.
- [008 — Distribution](docs/decisions/008-distribution-strategy.md): Homebrew tap + GoReleaser. Relevant when setting up releases.
- [009 — Token Cost Metrics](docs/decisions/009-token-cost-metrics.md): Token Cost per PR and Unmerged Token Spend. Dollar-cost metrics with model-specific pricing. Relevant when building session cost computation or repo-level metrics.
- [010 — GitHub Event Ingestion](docs/decisions/010-github-event-ingestion.md): `ax watch` poller + metric finalization lifecycle. Metrics only computed for terminal (merged/closed) PRs. Relevant when modifying sync paths or metric computation timing.

When making new decisions, follow the [template](docs/decisions/TEMPLATE.md) and add a reference here.

## Conventions

- All metric calculators live in `internal/metrics/` with corresponding `_test.go` files
- Parsers shell out to `git` and `gh` CLI via `os/exec` — no SDK dependencies
- Database queries go in `internal/db/queries.go`, models in `internal/db/models.go`
- Schema changes go in `internal/db/db.go` as new migration entries (append to the `migrations` slice)
- Tests use `t.TempDir()` for database files — no cleanup needed

## Data Flow

```
ax sync:
  git CLI → GitParser → commits, diffs, branches
  gh CLI  → GitHubParser → PRs, reviews, CI checks
  ↓
  sync.Run() orchestrates parsing + metric computation
  ↓
  SQLite (~/.ax/ax.db) stores repos, PRs, commits, metrics

ax report:
  SQLite → aggregate/per-PR metrics → terminal output
```

## Documentation

Documentation is a first-class deliverable. Every metric has a dedicated doc in `docs/metrics/` explaining what it measures, why it matters, how it's calculated, and how to interpret values. The dashboard will include a `/docs` route rendering these.
