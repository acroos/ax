# ADR-014: Remove Local Mode

## Status
Accepted

## Date
2026-04-12

## Context
AX currently supports two modes:

- **Local mode**: Go CLI + SQLite (`~/.ax/ax.db`). All data stays on the developer's machine. The CLI parses git, GitHub, and Claude Code session data, computes metrics, stores them locally, and serves an embedded dashboard.
- **Managed mode**: Rails API at `ax.up.railway.app` + Next.js dashboard at `ax-metrics.vercel.app`. Multi-tenant with GitHub OAuth, orgs, and team-based access.

Maintaining both modes creates significant complexity:

1. **Dual data layer** — the dashboard (`db.ts`) branches on every query: SQLite for local, API for managed. Every new feature must be implemented twice.
2. **Embedded dashboard** — the Go binary embeds a statically-exported Next.js build via `go:embed`, adding build complexity and limiting dashboard capabilities (no SSR, no API routes).
3. **CLI surface area** — local mode drives ~60% of CLI commands (`sync`, `report`, `status`, `export`, `dashboard`, `watch`) and several internal packages (`sync/`, `watch/`, `hooks/`, `export/`, `db/`).
4. **Metric computation in two places** — local mode computes metrics in the CLI, managed mode computes them server-side. Logic must be kept in sync.
5. **Managed mode is sufficient for individuals** — the managed service supports single-developer use via personal orgs. The onboarding flow (GitHub OAuth → org creation → `ax init --team`) is lightweight enough to be the only path.

The cost of maintaining local mode outweighs its benefits. No users have expressed a need for offline or fully-private analysis.

## Decision
Remove local mode entirely. AX becomes managed-mode only:

- **CLI** becomes a thin client: authenticates with `ax.up.railway.app`, installs Claude Code hooks that push session data to the server, and provides convenience commands that read from the API.
- **Dashboard** is hosted at `ax-metrics.vercel.app`, always reads from the Rails API. No embedded dashboard, no SQLite.
- **Metric computation** happens exclusively server-side (Rails).
- **Data ingestion** flows through two paths: CLI push (session data via hooks) and GitHub webhooks (PR events).
- **File-level data** (needed for diff churn, test detection, line revisit rate) is fetched server-side from the GitHub API at PR finalization (merge/close), not from the local git CLI. This avoids burdening webhook processing with API calls for PRs that may never merge.

### What this supersedes
- **ADR-003** (target scope): The "local MVP → team → managed" evolution path is collapsed to managed-only.
- **ADR-007** (embedded dashboard): No more `go:embed` static dashboard in the Go binary.
- **ADR-005** (session ingestion): Hooks still push data, but to the managed service instead of local SQLite.

## Alternatives Considered

### Keep local mode alongside managed
The status quo. Rejected because the maintenance cost is disproportionate to usage, and every new feature requires dual implementation.

### Self-hosted server option
Allow teams to deploy their own Rails instance. Rejected for now — it adds operational complexity (docs, support, compatibility testing) without clear demand. Can be revisited if users request it.

### Local mode as read-only API client
Keep `ax report` and `ax export` as commands that read from the API. Considered, but these are better served by the web dashboard and API endpoints directly. A CLI wrapper adds little value.

## Consequences

### What gets easier
- Every new feature is implemented once (Rails + dashboard)
- Dashboard has full Next.js capabilities (SSR, API routes, real-time updates)
- CLI is dramatically simpler — fewer commands, no SQLite dependency, no embedded assets
- Build pipeline simplifies — no static export step, no `go:embed`
- Testing surface shrinks significantly

### What gets harder or changes
- All users must create an account — zero-signup local usage is gone
- Internet connectivity is required — no offline analysis
- Users who want fully private data have no option (until/unless self-hosted is offered)
- The Go binary loses most of its functionality — worth evaluating whether the CLI should be rewritten or significantly trimmed

### What this unlocks
- Server-side features that don't make sense locally: real-time dashboards, cross-team comparisons, scheduled reports, Slack/email notifications
- Simpler onboarding: one path, one setup flow
- Faster iteration on metrics and dashboard without shipping new CLI versions
