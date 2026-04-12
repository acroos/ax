# AX — Agentic Coding DX Metrics

## What is this?

AX is a CLI + web dashboard that measures developer experience for agentic coding workflows. It analyzes git history, GitHub PR data, and Claude Code session data to surface actionable metrics about how effectively engineers work with AI coding agents.

AX has two modes:
- **Local mode**: Go CLI + SQLite (`~/.ax/ax.db`). Everything runs on your machine.
- **Managed mode**: Rails API at `app.ax.dev` + Next.js dashboard. Multi-tenant with GitHub OAuth, orgs, and team-based access.

There is no self-hosted server option. The Go CLI handles local analysis; the Rails app handles the managed service.

## Wiki — Read This First

The `wiki/` directory is the primary knowledge base for this repository. **Before exploring the codebase or reading source files, consult the relevant wiki page(s).** The wiki contains architecture, data model, component guides, auth flows, conventions, and more — with specific file paths and function names.

Start at [`wiki/index.md`](wiki/index.md) to find the right page. Key pages:

| Page | Use when... |
|------|-------------|
| [Architecture](wiki/architecture.md) | You need to understand components, modes, or how things connect |
| [Data Flow](wiki/data-flow.md) | You need to trace how data moves through the system |
| [Go CLI](wiki/go-cli.md) | Working on CLI commands, parsers, sync, hooks, or watch |
| [Rails Server](wiki/rails-server.md) | Working on the managed service API, webhooks, or push ingestion |
| [Dashboard](wiki/dashboard.md) | Working on the Next.js frontend, routes, or data layer |
| [Metrics](wiki/metrics.md) | Working on metric computation, finalization, or adding metrics |
| [Data Model](wiki/data-model.md) | Working on schema, tables, columns, or migrations |
| [Authentication](wiki/authentication.md) | Working on auth, API keys, OAuth, or session tokens |
| [Conventions](wiki/conventions.md) | Need to know coding patterns, file organization, or testing norms |

**Workflow:** Wiki page → identify the specific files you need → read only those files. Do not do broad codebase exploration when the wiki already tells you where to look.

**Keeping the wiki current:** When you make a code change that alters behavior, adds or removes features, changes architecture, modifies data flow, or would surprise someone reading the current wiki — update the relevant wiki pages and append an entry to `wiki/log.md`. Err on the side of updating. A bit of noise in the log is far better than an outdated wiki. The only changes that don't need a wiki update are purely cosmetic (typos, formatting) or internal refactors that don't change any observable behavior or structure.

## Build & Test

```bash
# Go CLI
make build           # Build binary to bin/ax
make test            # Run all tests
go test ./... -v     # Verbose test output
make fmt             # Format code
make lint            # Lint (requires golangci-lint)

# Rails server
cd server
bundle install
bundle exec rails db:create db:migrate
bundle exec rspec

# Dashboard
cd dashboard
npm install
npm run dev          # Development server on :3333
```

## Key Commands

```bash
# Setup
ax init --api-key <key>             # Validate API key, save config, install hooks
ax init --uninstall                 # Remove all AX hooks

# Data ingestion
ax push --repo .                    # Push session data to the AX server
```

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
- [011 — Team Server](docs/decisions/011-team-server.md): Original Go server design. **Superseded by Rails migration** — see `plans/rails-migration.md`.
- [012 — Event Service](docs/decisions/012-event-service.md): Platform-agnostic webhook receiver. **Reimplemented in Rails** — see `server/app/services/webhook_handlers/`.
- [013 — GitHub Integration Model](docs/decisions/013-github-integration-model.md): Dual-app architecture — OAuth App for login, GitHub App for repo access and webhook delivery. Relevant to any managed-service auth or repo ingestion work.
- [Open Questions](docs/decisions/open-questions.md): Pending decisions (CI images, PR author tracking, managed service path, etc.)

When making new decisions, follow the [template](docs/decisions/TEMPLATE.md) and add a reference here.

## Documentation

Documentation is a first-class deliverable:
- Every metric has a dedicated doc in `docs/metrics/` explaining what it measures, why it matters, how it's calculated, and how to interpret values
- The dashboard renders these at `/docs` and `/docs/[slug]`
- Team setup guide at `docs/team-setup.md`
- Feature plans live in `plans/` (rails migration, managed service identity, comparison views, export)
