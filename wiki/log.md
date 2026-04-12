# Wiki Log

Append-only record of wiki changes. Newest entries first.

---

## 2026-04-12 — Remove local mode from dashboard (Phase 4, Stream C)

**Pages updated:** dashboard, data-flow, conventions

- Dashboard no longer has dual-mode (local SQLite + API). It now fetches all data from the Rails API only.
- Removed `better-sqlite3` dependency, `isAPIMode()` checks, sync data functions, and `getDb()` SQLite initialization.
- Non-org-scoped `/prs` and `/compare` routes removed; implementations moved to org-scoped `/{slug}/prs` and `/{slug}/compare`.
- Root `/` page redirects to default org or login. Middleware always enforces auth.
- Updated data-flow display path section (removed local mode path).
- Updated conventions (removed sync variant mention).

---

## 2026-04-12 — Initial wiki creation

**Pages created:** index, architecture, data-flow, go-cli, rails-server, dashboard, metrics, data-model, authentication, conventions

**Summary:** Built the full repository wiki covering all three components (Go CLI, Rails server, Next.js dashboard), how they connect, the 16 metrics and their lifecycle, both database schemas, authentication mechanisms, data flow paths, and coding conventions. Derived from a comprehensive codebase review.
