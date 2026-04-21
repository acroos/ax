# AX — Agentic Coding DX Metrics

## What is this?

AX is a managed service that measures developer experience for agentic coding workflows. It analyzes GitHub PR data and Claude Code session data to surface actionable metrics about how effectively engineers work with AI coding agents.

AX has three components:
- **Go CLI** — Thin client that parses Claude Code session data and pushes it to the server. Installs hooks for automatic data collection.
- **Rails API** (`ax.up.railway.app`) — Backend service handling data ingestion, GitHub webhooks, metric computation, auth, and multi-tenant org management.
- **Next.js Dashboard** (`axmetrics.dev`) — Web UI for viewing metrics and managing orgs.

## Wiki — Read This First

The `wiki/` directory is the primary knowledge base for this repository. **Before exploring the codebase or reading source files, consult the relevant wiki page(s).** The wiki contains architecture, data model, component guides, auth flows, conventions, and more — with specific file paths and function names.

Start at [`wiki/index.md`](wiki/index.md) to find the right page. Key pages:

| Page | Use when... |
|------|-------------|
| [Architecture](wiki/architecture.md) | You need to understand components, modes, or how things connect |
| [Data Flow](wiki/data-flow.md) | You need to trace how data moves through the system |
| [Go CLI](wiki/go-cli.md) | Working on CLI commands, parsers, hooks, or push |
| [Rails Server](wiki/rails-server.md) | Working on the managed service API, webhooks, or push ingestion |
| [Dashboard](wiki/dashboard.md) | Working on the Next.js frontend, routes, or data layer |
| [Metrics](wiki/metrics.md) | Working on metric computation, finalization, or adding metrics |
| [Data Model](wiki/data-model.md) | Working on schema, tables, columns, or migrations |
| [Authentication](wiki/authentication.md) | Working on auth, API keys, OAuth, or session tokens |
| [Conventions](wiki/conventions.md) | Need to know coding patterns, file organization, or testing norms |

**Workflow:** Wiki page → identify the specific files you need → read only those files. Do not do broad codebase exploration when the wiki already tells you where to look.

**Keeping the wiki current:** When you make a code change that alters behavior, adds or removes features, changes architecture, modifies data flow, or would surprise someone reading the current wiki — update the relevant wiki pages. Err on the side of updating. A bit of noise is far better than an outdated wiki. The only changes that don't need a wiki update are purely cosmetic (typos, formatting) or internal refactors that don't change any observable behavior or structure.

## Build & Test

This project uses [Just](https://github.com/casey/just) as a command runner. There's a root `Justfile` that delegates to each sub-project, or you can `cd` into a project and run `just` directly.

```bash
# From root — cross-project commands
just              # List all recipes
just test         # Run all tests (CLI + server)
just lint         # Lint all projects

# Go CLI (cli/)
just cli-build    # Build binary to cli/bin/ax
just cli-test     # Run all tests
just cli-fmt      # Format code
just cli-lint     # Lint (requires golangci-lint)

# Rails server (server/)
just server-dev   # Start dev server
just server-test  # Run specs

# Dashboard (dashboard/)
just dashboard-dev    # Development server on :3333
just dashboard-test   # Run tests
just dashboard-build  # Production build
```

## Pre-push checks

Run the checks below before pushing. CI runs them per sub-project based on changed paths — run only the sections relevant to your changes.

**Go CLI:**
```bash
just cli-vet
just cli-test
just cli-build
```

**Rails Server:**
```bash
just server-brakeman
just server-audit
just server-lint
just server-test
```

Or run all four at once: `just server-check`

**Dashboard:**
```bash
just dashboard-test
just dashboard-typecheck
just dashboard-build
```

Or run all three at once: `just dashboard-check`

If you change CI (`.github/workflows/ci.yml`), update this list and the Justfile to match.

## Demo App

The /demo app should _exactly_ (wherever possible) match the real app's functionality.  Any changes to functionality or UI _must_ come with matching changes to the demo app.

## Dashboard UI

The dashboard uses Tailwind v4 with the **Parchment & Clay** theme defined in [`dashboard/src/app/globals.css`](dashboard/src/app/globals.css). Usage rules (semantic tokens, dos and don'ts, dark-mode, accessibility contract) live in [`dashboard/THEME.md`](dashboard/THEME.md) — **read it before styling any dashboard UI**.

Primitive UI components (button, dialog, dropdown-menu, input, select, tabs, tooltip, etc.) come from [shadcn/ui](https://ui.shadcn.com/) under `dashboard/src/components/ui/`. Install new primitives with `npx shadcn@latest add <name>` run from `dashboard/`. Compose primitives into app-specific components under `dashboard/src/components/`; never hand-roll a button, dropdown, or modal from scratch.

Light mode is the default; dark mode is user-toggleable via the `ThemeToggle` (`src/components/theme-toggle.tsx`) wired up through `next-themes`. Never write `dark:` Tailwind variants for colors that already have semantic tokens — the tokens remap automatically.

Brand assets (logo components `Mark`, `Wordmark`, `Logo` at `src/components/logo/`; favicons, PWA icons, OG images, manifest) all flow from [`dashboard/brand-assets/`](dashboard/brand-assets/README.md). The logo accent uses `--ax-clay` which aliases `--color-primary`, so it themes automatically. Follow the brand contract: ink + clay only, never recolor the ticks, never fill the dot with anything else.

See ADR-015 for the rationale behind both decisions.

## Decisions

All architectural decisions are documented in `docs/decisions/`. Reference these when working in the related area:

- [001 — Metrics Selection](docs/decisions/001-metrics-selection.md): Original metric set. Partially superseded by ADR-015.
- [015 — Metric Pruning](docs/decisions/015-metric-pruning.md): 9 metrics across 3 categories. Check this before adding or changing metrics.
- [002 — Form Factor](docs/decisions/002-form-factor.md): CLI + web dashboard. Don't build a plugin-only solution.
- [003 — Target Scope](docs/decisions/003-target-scope.md): **Superseded by ADR-014.** Originally: local → team → managed service path.
- [004 — CLI Language](docs/decisions/004-cli-language.md): Go for CLI, TypeScript for dashboard only.
- [005 — Session Ingestion](docs/decisions/005-session-ingestion-strategy.md): Claude Code hooks for team data collection. Relevant when building `ax init` or `ax push`.
- [006 — UX Philosophy](docs/decisions/006-ux-philosophy.md): Inline metric context, plain-language summaries, restrained chrome, honest about ambiguity. **Amended by ADR-015** — palette and mode defaults changed; principles still apply.
- [007 — Dashboard Packaging](docs/decisions/007-dashboard-packaging.md): **Superseded by ADR-014.** Originally: embedded static build via `go:embed`.
- [008 — Distribution](docs/decisions/008-distribution-strategy.md): Homebrew tap + GoReleaser. Relevant when setting up releases.
- [009 — Token Cost Metrics](docs/decisions/009-token-cost-metrics.md): Token Cost per PR. Dollar-cost metrics with model-specific pricing.
- [010 — GitHub Event Ingestion](docs/decisions/010-github-event-ingestion.md): GitHub webhooks + metric finalization lifecycle. Metrics only computed for terminal (merged/closed) PRs.
- [011 — Team Server](docs/decisions/011-team-server.md): Original Go server design. **Superseded by Rails migration** — see `plans/rails-migration.md`.
- [012 — Event Service](docs/decisions/012-event-service.md): Platform-agnostic webhook receiver. **Reimplemented in Rails** — see `server/app/services/webhook_handlers/`.
- [013 — GitHub Integration Model](docs/decisions/013-github-integration-model.md): Dual-app architecture — OAuth App for login, GitHub App for repo access and webhook delivery. Relevant to any managed-service auth or repo ingestion work.
- [014 — Remove Local Mode](docs/decisions/014-remove-local-mode.md): Managed-only architecture. Supersedes ADR-003, ADR-007. CLI is a thin push client, metrics computed server-side.
- [015 — Design System & shadcn/ui](docs/decisions/015-design-system-and-shadcn.md): Parchment & Clay theme + shadcn/ui as the primitive component library. Amends ADR-006. **Read before any dashboard styling work.**
- [016 — Teams within Orgs](docs/decisions/016-teams-within-orgs.md): Teams as people-groups within orgs for metric scoping and access control. Pro-only. Relevant when working on team management, team-scoped metrics, or org access control.
- [Open Questions](docs/decisions/open-questions.md): Pending decisions (CI images, PR author tracking, etc.)

When making new decisions, follow the [template](docs/decisions/TEMPLATE.md) and add a reference here.

## Documentation

Documentation is a first-class deliverable:
- Every metric has a dedicated doc in `docs/metrics/` explaining what it measures, why it matters, how it's calculated, and how to interpret values
- The dashboard renders these at `/docs` and `/docs/[slug]`
- Setup guide at `docs/setup.md`
- Feature plans live in `plans/` (rails migration, managed service identity, comparison views, export)
