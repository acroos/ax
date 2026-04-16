# AX Wiki

AX measures developer experience for agentic coding workflows. It analyzes git history, GitHub PR data, and Claude Code session data to produce 10 PR-level metrics across 3 categories, plus one repo-level metric.

AX operates as a managed service — the CLI pushes session data to the Rails API, which computes metrics server-side. The dashboard reads from the API.

## Pages

### System Overview
- **[Architecture](architecture.md)** — Components and how they connect
- **[Data Flow](data-flow.md)** — How data moves from sessions and GitHub webhooks through ingestion, metrics, and display

### Components
- **[Go CLI](go-cli.md)** — CLI commands, session parsing, and push client
- **[Rails Server](rails-server.md)** — Managed service API: models, endpoints, auth, webhooks, and push ingestion
- **[Dashboard](dashboard.md)** — Next.js app: routes, data layer, components, and styling

### Concepts
- **[Metrics](metrics.md)** — The metrics, how they're computed, and the finalization lifecycle
- **[Data Model](data-model.md)** — PostgreSQL schema, tables, and key relationships
- **[Authentication](authentication.md)** — CLI API keys, GitHub OAuth, session tokens, and cross-origin handoff
- **[Conventions](conventions.md)** — Coding patterns, file organization, testing, and contribution norms
