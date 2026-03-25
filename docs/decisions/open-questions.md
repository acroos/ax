# Open Questions & Decisions

Items that need decisions before or shortly after the team release. These are documented here so they don't get lost.

## 1. CI Pipeline for Container Images

**Status:** Not yet built

The Helm chart references `ghcr.io/acroos/ax:latest`, `ghcr.io/acroos/ax-dashboard:latest`, and `ghcr.io/acroos/ax-watcher:latest`. These images don't exist yet.

**Options:**
- A. Add a GitHub Actions workflow that builds and pushes on git tags (like the existing GoReleaser workflow)
- B. Teams build from source (`docker compose build`) — no published images

**Recommendation:** Option A. Publishing images to ghcr.io makes setup significantly simpler and eliminates the `git clone` step for Docker Compose deployments.

**Effort:** ~1 hour (standard multi-platform Docker build + push workflow)

## 2. PR Author Tracking

**Status:** Schema doesn't have it yet

The comparison views plan (`plans/comparison-views.md`) requires an `author` column on the `prs` table to enable per-developer filtering and team vs individual comparisons. The `gh pr list` command supports an `author` JSON field but we don't fetch it.

**Decision needed:** Add this as part of the comparison views implementation or as a standalone migration now?

**Recommendation:** Add it now (migration 5) since it's trivial and enables the comparison views feature without a schema change later.

## 3. Dashboard Authentication Timing

**Status:** Deferred — teams handle auth on their own infra for now

Current decision: no dashboard auth in v1. Teams use VPN, nginx basic auth, or Cloudflare Access to protect the dashboard.

**When to revisit:** When we build the managed service tier, or when teams explicitly request it. The plan is at `plans/dashboard-auth.md`.

## 4. Managed Service Path

**Status:** Not started, no timeline

ADR-003 describes a three-phase evolution: local → team (current) → managed service. Questions:
- At what point does a hosted offering make sense?
- Does the managed service change what we prioritize now?
- Should the hosted version be a separate repo or the same codebase with a hosting layer?

**No decision needed now** — document and revisit when there's demand signal.

## 5. Postgres Migration Versioning

**Status:** Working but could be cleaner

SQLite and Postgres have separate migration systems:
- SQLite: versioned migrations in `internal/db/db.go` (versions 1-4)
- Postgres: single migration in `internal/db/postgres_migrations.go` (version 1 with full schema)

If we add more schema changes, we need to maintain both. Options:
- A. Keep separate migration files (current approach)
- B. Use a migration tool like `golang-migrate` that supports both dialects
- C. Generate Postgres migrations from SQLite migrations automatically

**Recommendation:** Keep separate for now (Option A). The schemas will diverge as we add Postgres-specific features (e.g., full-text search, JSON columns). If it becomes a maintenance burden, adopt `golang-migrate`.

## 6. Watcher in Team Mode: Direct DB vs Push API

**Status:** Watcher writes directly to Postgres

The watcher container connects to Postgres directly and writes PR state changes. An alternative would be to have the watcher push via the server's API (which would centralize all writes through the server).

**Current decision:** Direct DB access is simpler and avoids the watcher needing an API key. The `_busy_timeout` / Postgres connection pooling handles concurrent writes fine.

**Revisit if:** We add write-side middleware (audit logging, rate limiting, access control) that the watcher would need to go through.
