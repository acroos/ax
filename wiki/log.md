# Wiki Log

Append-only record of wiki changes. Newest entries first.

---

## 2026-04-12 — GitHub App webhook routing for installation events (Phase 4)

**Pages updated:** rails-server

**Summary:** Added webhook routing for GitHub App installation lifecycle events — Phase 4 of the github-app-installation plan. `ProcessGitHubWebhookJob` now handles `installation` (created/deleted/suspend/unsuspend) and `installation_repositories` (added/removed) events, dispatching to 5 new handlers in `app/services/webhook_handlers/`. `WebhooksController#valid_github_signature?` now resolves per-installation webhook secrets before falling back to the global env var. `GithubInstallation.organization_id` is now nullable to support the webhook-arriving-before-callback race condition. Both the callback and webhook are idempotent and converge to the same state.

---

## 2026-04-12 — GitHub App installation flow (Phase 3)

**Pages updated:** rails-server

**Summary:** Added the GitHub App install flow — Phase 3 of the github-app-installation plan. New Rails endpoints: `POST /api/v1/orgs/:slug/github_installation/install_url` (admin-only, returns signed install URL), `GET /api/v1/orgs/:slug/github_installation` (returns installation state + user role), and `GET /github/installations/callback` (handles redirect back from GitHub after install). Uses Rails' `MessageVerifier` for short-lived signed state tokens. Dashboard settings page (`/{slug}/settings`) now shows a GitHub App integration card with install button (admin), connected status, or suspended warning. Non-admins see a read-only view.

---

## 2026-04-12 — Fix session end hook and simplify ax init

**Pages updated:** go-cli

**Summary:** Fixed three bugs in the hooks system: (1) CWD extraction grep pattern didn't handle spaces in Claude Code's JSON (`"cwd": "/path"` vs `"cwd":"/path"`), (2) `Install`/`Uninstall`/`IsInstalled` only managed `SessionEnd` hooks, leaving stale `Stop` hooks behind, (3) `ax init` required `--server` and `--user` flags that are no longer needed. Server URL now defaults to `config.DefaultServerURL`. Removed `UserName` from `Config` struct.

---

## 2026-04-12 — Remove local mode from CLI (Stream B)

**Pages updated:** index, architecture, data-flow, go-cli, data-model, authentication, conventions, metrics

**Summary:** Updated all wiki pages to reflect the removal of local mode from the Go CLI (ADR-014, Stream B). The CLI is now a thin client that parses Claude Code sessions and pushes them to the managed service. Removed all references to SQLite, `ax sync`, `ax report`, `ax status`, `ax export`, `ax dashboard`, `ax watch`, and the deleted packages (`internal/sync/`, `internal/watch/`, `internal/export/`, `internal/correlator/`, `internal/db/`). Updated architecture diagrams, command tables, package structures, and data flow descriptions.

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

## 2026-04-12 — Server-side file-level data fetching and metric computation

**Pages updated:** rails-server, data-model, data-flow, metrics

**Summary:** Added documentation for Phase 0 of remove-local-mode (ADR-014). The Rails server now fetches file paths and per-commit stats from the GitHub API at PR finalization, stores them in a new `pr_files` table, and computes `diff_churn_lines`, `has_tests`, and `line_revisit_rate` server-side via `GithubDataFetcher` and `MetricsComputer` services. Updated webhook handler docs to reflect the new fetch-compute-finalize flow.

---

## 2026-04-12 — CLAUDE.md restructured to be wiki-first

**Pages affected:** none (CLAUDE.md only)

**Summary:** Removed duplicated content from CLAUDE.md (architecture tree, data flow diagram, dashboard routes, webhook events table, conventions, metrics list) that was redundant with the wiki. Replaced with a "Wiki — Read This First" section containing a routing table that directs agents to the right wiki page based on what they're working on. This makes the wiki the primary knowledge base and CLAUDE.md the quick-reference entry point.

---

## 2026-04-12 — Initial wiki creation

**Pages created:** index, architecture, data-flow, go-cli, rails-server, dashboard, metrics, data-model, authentication, conventions

**Summary:** Built the full repository wiki covering all three components (Go CLI, Rails server, Next.js dashboard), how they connect, the 16 metrics and their lifecycle, both database schemas, authentication mechanisms, data flow paths, and coding conventions. Derived from a comprehensive codebase review.
