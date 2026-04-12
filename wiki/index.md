# AX Wiki

AX measures developer experience for agentic coding workflows. It analyzes git history, GitHub PR data, and Claude Code session data to produce 16 metrics across 4 categories.

Two modes of operation:
- **Local mode** — Go CLI + SQLite. Everything on your machine.
- **Managed mode** — Rails API + Next.js dashboard. Multi-tenant with GitHub OAuth and org-based access.

## Pages

### System Overview
- **[Architecture](architecture.md)** — Components, how they connect, and the two operating modes
- **[Data Flow](data-flow.md)** — How data moves from git/GitHub/sessions through ingestion, correlation, metrics, and display

### Components
- **[Go CLI](go-cli.md)** — CLI commands, parsers, sync engine, hooks, and background polling
- **[Rails Server](rails-server.md)** — Managed service API: models, endpoints, auth, webhooks, and push ingestion
- **[Dashboard](dashboard.md)** — Next.js app: routes, dual-mode data layer, components, and styling

### Concepts
- **[Metrics](metrics.md)** — The 16 metrics, how they're computed, and the finalization lifecycle
- **[Data Model](data-model.md)** — SQLite and PostgreSQL schemas, tables, and key relationships
- **[Authentication](authentication.md)** — Local mode (none), CLI API keys, GitHub OAuth, session tokens, and cross-origin handoff
- **[Conventions](conventions.md)** — Coding patterns, file organization, testing, and contribution norms
