# Architecture

AX is three components that work together in two configurations.

## Components

| Component | Language | Location | Role |
|-----------|----------|----------|------|
| **Go CLI** | Go | `cmd/ax/`, `internal/` | Data ingestion, metric computation, local storage, automation |
| **Rails Server** | Ruby | `server/` | Managed service API: multi-tenant data storage, webhooks, auth |
| **Dashboard** | TypeScript | `dashboard/` | Web UI for viewing metrics, comparing developers, browsing docs |

## Operating Modes

### Local Mode

```
┌──────────┐     ┌───────────┐     ┌───────────┐
│ git CLI  │────→│           │     │           │
│ gh CLI   │────→│  Go CLI   │────→│  SQLite   │←────→ Dashboard
│ Sessions │────→│ (ax sync) │     │ ~/.ax/db  │      (localhost)
└──────────┘     └───────────┘     └───────────┘
```

The CLI parses data from three sources, computes metrics, and writes to a local SQLite database. The dashboard reads that same database directly. No server, no auth, no network.

### Managed Mode

```
┌──────────┐     ┌───────────┐     ┌────────────┐     ┌────────────┐
│ git CLI  │────→│           │     │            │     │            │
│ gh CLI   │────→│  Go CLI   │────→│ Rails API  │────→│ PostgreSQL │
│ Sessions │────→│ (ax sync  │     │ app.ax.dev │     │            │
└──────────┘     │  + push)  │     └──────┬─────┘     └────────────┘
                 └───────────┘            │
                                          │ API
                 ┌──────────┐             │
                 │  GitHub   │─webhooks──→│
                 │  Events   │            │
                 └──────────┘             │
                                    ┌─────┴──────┐
                                    │ Dashboard   │
                                    │ (hosted)    │
                                    └────────────┘
```

Multiple developers run the CLI locally, push data to the Rails API. GitHub webhooks provide real-time PR event updates. The dashboard reads from the API, scoped to organizations.

## How Components Connect

### CLI → SQLite (Local)
The CLI writes directly to `~/.ax/ax.db` via `internal/db/`. All data ingestion and metric computation happens in Go. The database is the only shared state between CLI and dashboard in local mode.

### CLI → Rails API (Managed)
When team mode is configured (`~/.ax/config.json`), the CLI pushes data via `POST /api/v1/push` after each sync. The push payload contains repos, PRs, commits, sessions, correlations, and computed metrics. Authentication uses an API key (`ax_k1_...`).

See: [Go CLI — Push & Team Mode](go-cli.md#push--team-mode)

### Dashboard → SQLite (Local)
The dashboard uses `better-sqlite3` to read `~/.ax/ax.db` directly in Next.js server components. Sync functions return data immediately — no network calls.

### Dashboard → Rails API (Managed)
When `AX_API_URL` is set, the dashboard fetches data from the Rails API using session tokens (`X-Ax-Session` header). All data is org-scoped.

See: [Dashboard — Dual-Mode Data Layer](dashboard.md#dual-mode-data-layer)

### GitHub → Rails API (Webhooks)
GitHub sends webhook events to `POST /webhooks/github`. The server validates HMAC-SHA256 signatures and processes events asynchronously via background jobs. This enables real-time metric updates without polling.

See: [Rails Server — Webhook Handling](rails-server.md#webhook-handling)

## Key Files

| File | Purpose |
|------|---------|
| `cmd/ax/main.go` | CLI entry point, all Cobra commands |
| `internal/sync/sync.go` | Sync orchestration engine |
| `server/config/routes.rb` | All Rails API endpoints |
| `server/app/services/push_service.rb` | Push data ingestion logic |
| `dashboard/src/lib/db.ts` | Dual-mode data layer |
| `dashboard/src/lib/auth.ts` | Auth mode detection and helpers |
