# Architecture

AX is three components that work together as a managed service.

## Components

| Component | Language | Location | Role |
|-----------|----------|----------|------|
| **Go CLI** | Go | `cli/` | Session data parsing, push to server, hook installation |
| **Rails Server** | Ruby | `server/` | Managed service API: multi-tenant data storage, webhooks, auth, metric computation |
| **Dashboard** | TypeScript | `dashboard/` | Web UI for viewing metrics and browsing docs |

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

## Agent Registry

All three components share a single agent registry driven by `config/agents.yaml`. A codegen pipeline (`scripts/codegen-agents/generate.rb`) emits language-specific files from that one source of truth:

```
config/agents.yaml ──(codegen)──┬── cli/internal/agents/registry.gen.go
                                 ├── server/app/models/agent_registry.rb
                                 └── dashboard/src/lib/agents.gen.ts

CLI push:                              Server ingest:                  Dashboard render:
  for p in RegisteredProviders():        AgentRegistry.supports_field?    AGENT_LABELS[id]
    p.DiscoverSessions(target)           PushService.upsert_sessions       agentSupportsMetric(id, slug)
    p.Parse(loc)                         MetricsAggregator (filtered)      <AgentTypeFilter />
    payload.append(session)                                                 metric NULL → "N/A"
```

`agents.yaml` declares three agents (Claude Code, Copilot CLI, Cursor CLI) with their labels, colors, hook scopes, and a per-field and per-metric capability matrix. Adding a fourth agent is a single edit to `agents.yaml` + `just codegen-agents`.

The two Go interfaces that make the CLI loop agent-agnostic:
- `agents.Provider` (`cli/internal/agents/provider.go`) — session discovery and parsing
- `hooks.Installer` (`cli/internal/hooks/installer.go`) — hook install/uninstall

Per-agent implementations live under `cli/internal/agents/<id>/` and `cli/internal/hooks/<id>/`. See [Go CLI — Adding a new agent](go-cli.md#adding-a-new-agent) for the step-by-step runbook.

See [ADR-018](../docs/decisions/018-multi-agent-abstractions.md) for the full rationale.

## Key Files

| File | Purpose |
|------|---------|
| `cli/cmd/ax/main.go` | CLI entry point — init and push commands |
| `config/agents.yaml` | Agent registry + capability matrix (source of truth) |
| `cli/internal/agents/provider.go` | `Provider` interface for session discovery + parsing |
| `cli/internal/hooks/installer.go` | `Installer` interface for hook management |
| `server/config/routes.rb` | All Rails API endpoints |
| `server/app/services/push_service.rb` | Push data ingestion logic |
| `server/app/models/agent_registry.rb` | Generated Ruby agent registry (do not hand-edit) |
| `dashboard/src/lib/agents.gen.ts` | Generated TS types, labels, capability functions (do not hand-edit) |
| `dashboard/src/lib/db.ts` | Dashboard data layer |
| `dashboard/src/lib/auth.ts` | Auth mode detection and helpers |
