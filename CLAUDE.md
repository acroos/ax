# AX — Agentic Coding DX Metrics

## What is this?

AX is a CLI + web dashboard that measures developer experience for agentic coding workflows. It analyzes git history, GitHub PR data, and Claude Code session data to surface actionable metrics about how effectively engineers work with AI coding agents. Deployable locally for individuals or as a shared server for teams.

## Architecture

- **Go** — CLI binary, core engine, and team server (`cmd/ax/`, `internal/`)
- **TypeScript/Next.js** — Dashboard (`dashboard/`)
- **SQLite** — Local data storage at `~/.ax/ax.db`
- **PostgreSQL** — Team server data storage (Docker Compose or Helm)

```
cmd/ax/              CLI entry point (cobra)
internal/
  api/               Push payload types + conversion functions
  config/            Team mode configuration (~/.ax/config.json)
  correlator/        Session-to-PR correlation
  db/                Schema, migrations (SQLite + Postgres), queries, models
  events/            Normalized event model + dispatcher
    adapters/        Platform-specific webhook adapters (GitHub, etc.)
  export/            Machine-readable data export (JSON, JSONL, CSV)
  hooks/             Claude Code hook installation/management
  metrics/           Metric calculators (output quality, agent behavior, planning)
  parsers/
    git.go           Git log/diff/blame parser via os/exec
    github.go        GitHub PR/review/CI parser via gh CLI
    claude_sessions.go  Claude Code session JSONL parser
  pricing/           Token cost computation with model-specific pricing
  push/              Push client + data extraction for team mode
  server/            HTTP server for team mode (push API + read endpoints + webhooks)
  sync/
    sync.go          Orchestrates data ingestion + metric computation
    finalize.go      Metric finalization for terminal PRs
    watch.go         GitHub polling (RunGitHubOnly)
  watch/             System-level scheduling (launchd/cron)
dashboard/           Next.js web dashboard
  src/app/           Pages: /, /prs, /prs/[id], /compare, /docs, /docs/[slug]
  src/lib/db.ts      Data layer (dual-mode: SQLite local or API remote)
  src/components/    Shared components (charts, time picker, developer selector)
deploy/helm/ax/      Helm chart for Kubernetes deployment
docs/
  decisions/         Architecture Decision Records (12 ADRs)
  metrics/           Per-metric documentation (16 files)
  team-setup.md      Team deployment guide (Docker Compose + Helm)
plans/               Feature planning artifacts
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
# Data ingestion
ax sync --repo .                    # Full sync: git + GitHub + sessions + metrics
ax sync --sessions-only --repo .    # Lightweight: re-parse sessions only

# Reporting
ax report                           # Aggregate metrics for current repo
ax report --pr 42                   # Metrics for a specific PR
ax status                           # Tracked repos, sync times, watch status

# Export
ax export --format json --repo .    # Export finalized PR metrics as JSON
ax export --format csv --all-repos  # CSV across all repos
ax export --format jsonl --since 2026-01-01  # Streaming JSONL with date filter
ax export --aggregate               # Repo-level aggregate metrics

# Automation
ax init                             # Install Claude Code hooks + background polling
ax init --live                      # Also install mid-session sync hook
ax watch                            # Foreground GitHub polling
ax watch --once                     # Single poll cycle
ax watch install                    # Install as launchd (macOS) / cron (Linux)
ax watch uninstall                  # Remove system job
ax watch status                     # Show watched repos + poll times
ax dashboard                        # Start the web dashboard (dev mode)

# Team mode
ax init --team <url> --api-key <key> --user "Name"  # Interactive team setup
ax push --repo .                    # Manually push to team server
ax server                           # Start team HTTP server (requires Postgres)
ax server init                      # Create DB schema + first API key
ax server create-key <name>         # Generate additional API key
ax server list-keys                 # List all API keys
ax server revoke-key <name>         # Revoke an API key
```

## Metrics (16 across 4 categories)

**Output Quality:** post-open commits, first-pass acceptance rate, CI success rate, test coverage, diff churn, line revisit rate

**Prompt Efficiency:** messages per PR, iteration depth, token cost per PR

**Agent Behavior:** self-correction rate, context efficiency, error recovery attempts

**Planning Effectiveness:** plan coverage, plan deviation, scope creep detection

**Repo-Level:** unmerged token spend (waste rate)

Metrics are only computed for finalized (merged/closed) PRs. Open PRs are excluded from reports and the dashboard.

## Dashboard Routes

| Route | Page | Description |
|-------|------|-------------|
| `/` | Overview | Aggregate metric cards, sparklines, trend charts |
| `/prs` | PR List | Table of finalized PRs with inline metrics |
| `/prs/[id]` | PR Detail | All 15 metrics grouped by category |
| `/compare` | Compare | Developer leaderboard, individual vs team, time filtering |
| `/docs` | Docs Index | Metric documentation listing |
| `/docs/[slug]` | Metric Doc | Individual metric explanation |

## Data Flow

```
Local mode (ax sync):
  git CLI → GitParser → commits, diffs, branches
  gh CLI  → GitHubParser → PRs, reviews, CI checks
  Claude Code sessions → ParsedSession → token/cost data
  ↓
  sync.Run() → correlate sessions to PRs → compute metrics → finalize
  ↓
  SQLite (~/.ax/ax.db)
  ↓ (if team mode configured)
  ax push → POST /api/v1/push → team server (Postgres)

Team server (ax server):
  POST /api/v1/push ← developer CLIs push data
  POST /webhooks/github ← GitHub webhooks (real-time PR events)
  ax watch (watcher container) → polls GitHub → finalizes metrics
  ↓
  GET /api/v1/* → dashboard reads via API
```

## Webhook Events (Event Service)

The server accepts platform-specific webhooks at `POST /webhooks/{platform}`, normalizes them into events, and dispatches to handlers:

| Event | Trigger | Action |
|-------|---------|--------|
| `pr_merged` | PR merged on GitHub | Finalize all metrics |
| `pr_closed` | PR closed without merge | Finalize as abandoned |
| `review_submitted` | Review posted | Update first-pass acceptance |
| `ci_completed` | Check suite finished | Update CI success rate |

Configure with `AX_WEBHOOK_GITHUB_SECRET` env var. Polling via `ax watch` remains as a fallback.

## Deployment

**Local:** `brew install acroos/tap/ax` → `ax init` → `ax sync --repo .`

**Team (Docker Compose):**
```bash
cp .env.example .env && docker compose up -d
docker compose exec server ax server init
```

**Team (Kubernetes):**
```bash
helm install ax deploy/helm/ax/ --set postgresql.auth.password=<pw> --set github.token=<tok>
```

See `docs/team-setup.md` for complete instructions.

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
- [009 — Token Cost Metrics](docs/decisions/009-token-cost-metrics.md): Token Cost per PR and Unmerged Token Spend. Dollar-cost metrics with model-specific pricing.
- [010 — GitHub Event Ingestion](docs/decisions/010-github-event-ingestion.md): `ax watch` poller + metric finalization lifecycle. Metrics only computed for terminal (merged/closed) PRs.
- [011 — Team Server](docs/decisions/011-team-server.md): Push-based team data collection with Postgres, API key auth, Docker Compose + Helm deployment.
- [012 — Event Service](docs/decisions/012-event-service.md): Platform-agnostic webhook receiver with normalized events. GitHub adapter implemented; GitLab/Jira/Linear adapters planned.
- [Open Questions](docs/decisions/open-questions.md): Pending decisions (CI images, PR author tracking, managed service path, etc.)

When making new decisions, follow the [template](docs/decisions/TEMPLATE.md) and add a reference here.

## Conventions

- All metric calculators live in `internal/metrics/` with corresponding `_test.go` files
- Parsers shell out to `git` and `gh` CLI via `os/exec` — no SDK dependencies
- Database queries go in `internal/db/queries.go`, models in `internal/db/models.go`
- Query functions accept `db.DBTX` interface (works with both `*sqlx.DB` and `*sqlx.Tx`)
- Schema changes: SQLite in `internal/db/db.go` (versioned migrations), Postgres in `internal/db/postgres_migrations.go`
- Use `CURRENT_TIMESTAMP` in SQL (works in both SQLite and Postgres — never `datetime('now')`)
- Tests use `t.TempDir()` for database files — no cleanup needed
- Dashboard data functions have sync (local SQLite) and async (API mode) variants

## Documentation

Documentation is a first-class deliverable:
- Every metric has a dedicated doc in `docs/metrics/` explaining what it measures, why it matters, how it's calculated, and how to interpret values
- The dashboard renders these at `/docs` and `/docs/[slug]`
- Team deployment has a complete setup guide at `docs/team-setup.md`
- Feature plans live in `plans/` (event service, comparison views, dashboard auth, export)
