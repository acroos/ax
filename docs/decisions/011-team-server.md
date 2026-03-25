# ADR-011: Team Server Architecture

## Status
Accepted

## Date
2026-03-25

## Context
AX was built as a local-only tool: each developer has their own SQLite database at `~/.ax/ax.db` with no way to aggregate metrics across a team. Teams need a shared view of agentic coding metrics to understand team-wide patterns, identify training opportunities, and track improvements over time.

## Decision

### Push-based data collection with PostgreSQL

Teams deploy a shared AX server that receives pushed data from each developer's CLI. The server uses PostgreSQL (not SQLite) because:
- Teams on Kubernetes need a database that works with ephemeral pods
- PostgreSQL handles concurrent writes from multiple push sources
- SQLite on network-attached storage (common in K8s PVCs) has WAL mode issues

### Architecture: 4 services

1. **server** (Go): HTTP API accepting `ax push` data, managing API keys, serving read endpoints for the dashboard
2. **dashboard** (Next.js): Reads metrics via the server's REST API (when `AX_API_URL` is set) instead of direct SQLite access
3. **watcher** (Go + gh CLI): Polls GitHub for PR state changes, finalizes metrics in Postgres
4. **postgresql**: Shared database

### Local CLI unchanged

The local `ax` CLI continues to use SQLite at `~/.ax/ax.db`. When team mode is configured (`~/.ax/config.json` with `mode: "team"`), `ax sync` automatically pushes to the server after completing the local sync. Developers keep a local copy of their own data.

### API key authentication for v1

The server generates `ax_k1_` prefixed API keys, stored as bcrypt hashes. Simple and sufficient for internal team use. Future: GitHub OAuth with org/team restriction (see `plans/dashboard-auth.md`).

### Two deployment options

- **Docker Compose**: For teams on a single server. 4-service compose file with Postgres volume.
- **Helm chart**: For teams on Kubernetes. Bitnami PostgreSQL subchart, configurable ingress.

## Alternatives Considered

- **SQLite on the server**: Works for Docker Compose but breaks on K8s (WAL on network storage). Would require a single-writer constraint.
- **Full database abstraction layer**: Interface with SQLite and Postgres implementations. Too much refactoring for the v1 timeline. Instead, the local CLI uses SQLite and the server uses Postgres — separate code paths at the connection level, shared query logic via the `DBTX` interface.
- **Webhook-based ingestion** (instead of push): Requires a publicly accessible server. The push model works regardless of network topology since developers initiate the connection.
- **GitHub OAuth for v1**: More secure but significantly more infrastructure (OAuth app registration, callback URL handling, session management). Deferred to v2.

## Consequences

**Easier:**
- Teams get a shared dashboard with <30 minutes of setup
- Each developer's setup is a single `ax init --team` command with connectivity validation
- `ax sync` transparently pushes — no workflow change for developers
- Works on both Docker Compose and Kubernetes

**Harder:**
- Two database dialects to maintain (SQLite + Postgres), though most queries work via sqlx
- Server adds deployment complexity vs the local-only tool
- API key management is manual (no self-service rotation yet)

**Future path:**
- GitHub OAuth authentication (`plans/dashboard-auth.md`)
- Platform-agnostic webhook receiver (`plans/event-service.md`) to replace polling
- Comparison views across developers and time (`plans/comparison-views.md`)
- Data export for BI integration (`plans/export.md`)
