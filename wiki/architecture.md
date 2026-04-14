# Architecture

AX is three components that work together as a managed service.

## Components

| Component | Language | Location | Role |
|-----------|----------|----------|------|
| **Go CLI** | Go | `cli/` | Session data parsing, push to server, hook installation |
| **Rails Server** | Ruby | `server/` | Managed service API: multi-tenant data storage, webhooks, auth, metric computation |
| **Dashboard** | TypeScript | `dashboard/` | Web UI for viewing metrics, comparing developers, browsing docs |

## Architecture

```
┌──────────┐     ┌───────────┐     ┌────────────┐     ┌────────────┐
│  Claude   │     │           │     │            │     │            │
│  Code     │────→│  Go CLI   │────→│ Rails API  │────→│ PostgreSQL │
│  Sessions │     │ (ax push) │     │            │     │            │
└──────────┘     └───────────┘     └──────┬─────┘     └────────────┘
                                          │
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

Developers run the CLI locally. It parses Claude Code session data and pushes it to the Rails API. GitHub webhooks provide real-time PR event updates. Metric computation happens entirely server-side. The dashboard reads from the API, scoped to organizations.

## How Components Connect

### CLI → Rails API
The CLI pushes session data via `POST /api/v1/push` after each Claude Code session (automatically via hooks, or manually via `ax push`). Authentication uses an API key (`ax_k1_...`) stored in `~/.ax/config.json`.

See: [Go CLI — Push Client](go-cli.md#push-client)

### Dashboard → Rails API
The dashboard fetches data from the Rails API using session tokens (`X-Ax-Session` header). All data is org-scoped.

See: [Dashboard](dashboard.md)

### GitHub → Rails API (Webhooks)
GitHub sends webhook events to `POST /webhooks/github`. The server validates HMAC-SHA256 signatures and processes events asynchronously via background jobs. This enables real-time metric updates without polling.

See: [Rails Server — Webhook Handling](rails-server.md#webhook-handling)

## Key Files

| File | Purpose |
|------|---------|
| `cli/cmd/ax/main.go` | CLI entry point — init and push commands |
| `server/config/routes.rb` | All Rails API endpoints |
| `server/app/services/push_service.rb` | Push data ingestion logic |
| `dashboard/src/lib/db.ts` | Dashboard data layer |
| `dashboard/src/lib/auth.ts` | Auth mode detection and helpers |
