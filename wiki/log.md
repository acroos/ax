# Wiki Log

Append-only record of wiki changes. Newest entries first.

---

## 2026-04-13 — UX improvements batch

**Pages updated:** dashboard, metrics, data-flow

- Metric drill-down page moved from `/metrics/[slug]` to `/{slug}/metrics/[metric]` (org-scoped)
- Overview metric cards are now clickable links to drill-down pages
- Overview metric cards have tooltips with descriptions and "good" ranges
- Overview page shows selected repo name or "All Repositories"
- Sidebar repo selector highlights active repo filter
- PR list table has "Sessions" column showing linked agent session count
- Aggregate metrics API returns `sessionDataCount` and `sessionMetricsCount`
- Fixed merged PRs showing as "closed" — state update moved before finalization guard in PrMerged/PrClosed handlers
- Fixed GitHub App installation stale cache — `getGithubInstallation()` no longer caches
- Added `data:fix_merged_pr_states` rake task to repair existing data
- `metric-defs.ts` now includes `tooltip` and `goodRange` fields per metric

---

## 2026-04-13 — Improve user settings page

**Pages updated:** dashboard

- `/settings` page renamed from "Settings" to "Account" with clearer user-scoped framing
- Added profile section showing GitHub identity (avatar, display name, username, email)
- Added logout button with new `/auth/logout` route handler
- API key section extracted to `api-key-section.tsx` client component
- Sidebar nav label updated: org settings link says "Org Settings", user menu link says "Account"

---

## 2026-04-13 — Redesign data ingestion pipeline for immediate PR visibility

**Pages updated:** data-flow (rewritten), rails-server

**Summary:** Complete overhaul of data ingestion to fix the empty pull requests tab. Core changes:
- **Repo identity**: canonical lookup by `(org_id, github_owner, github_repo)` instead of local filesystem path. Prevents duplicates across developers and backfill/push ordering.
- **BackfillRepoJob**: new single-repo backfill job extracted from BackfillInstallationJob. Triggered by: push, GitHub App install, repo addition, daily reconciliation.
- **SessionPrCorrelationService**: new server-side session-to-PR correlation by branch match. Computes session-derived metrics (cost, messages, depth) on matched PRs.
- **Scoped write protection**: PrMetrics GitHub-derived fields lock after settlement; session-derived fields remain updatable via `update_session_metrics!` for late-arriving session data.
- **Progressive visibility**: dashboard shows all PRs (not just finalized). Aggregates still use settled PRs only.
- **ReconcileReposJob**: daily scheduled job that re-syncs all repos from GitHub API as a self-healing safety net.
- **Backfill on push**: PushService triggers BackfillRepoJob after each push if the repo has a GitHub App linked.
- **Backfill on repo addition**: InstallationRepositories webhook triggers BackfillRepoJob for newly added repos.

---

## 2026-04-13 — Add `ax push --all` bulk push command

**Pages updated:** go-cli, CLAUDE.md

**Summary:** Added `ax push --all` to discover all repos from `~/.claude/history.jsonl` and bulk push sessions. New `internal/bulk/` package handles repo discovery (with worktree resolution and deduplication), session chunking (batches of 100), parallel push (3 workers), ANSI progress display, and error logging to `~/.ax/logs/`. Includes confirmation prompt before push and polished completion summary.

---

## 2026-04-13 — Dashboard bug fixes and backfill improvements

**Pages updated:** dashboard, rails-server, data-flow

**Summary:** Fixed 7 bugs found after connecting a GitHub App:

1. **Overview page**: Replaced the redirect-to-PRs stub at `/{slug}` with a real overview page showing aggregate metrics across all PRs, grouped by category (Output Quality, Prompt Efficiency, Agent Behavior, Planning Effectiveness).
2. **Org-level PR listing**: Added `GET /api/v1/orgs/:slug/prs` and `GET /api/v1/orgs/:slug/metrics` endpoints so the PR list and overview work without selecting a specific repo. Updated `listPRsWithMetricsAsync` and `getAggregateMetricsAsync` to use these.
3. **Em-dash rendering**: Fixed `?? "&#8212;"` patterns (rendered literally in JSX) → `?? "\u2014"`.
4. **PR size and lines changed**: `GithubDataFetcher` now computes `additions`/`deletions`/`changed_files` from fetched `PrFile` records. Previously 0 for backfilled PRs because the GitHub list endpoint doesn't include diff stats.
5. **Boolean type mismatch**: Fixed `PRMetrics` TypeScript interface — `first_pass_accepted`, `has_tests`, `scope_creep_detected` are `boolean | null` (not `number | null`). Fixed `=== 1` comparisons → `=== true`.
6. **Review backfill**: `BackfillInstallationJob` now fetches PR reviews from GitHub API before finalization, so `first_pass_accepted` is populated for backfilled PRs.
7. **Date formatting**: `finalized_at` on PR detail page now formatted as "Mon DD, YYYY" instead of raw ISO string.

---

## 2026-04-13 — Add /api/v1/ping endpoint for CLI API key validation

**Pages updated:** go-cli, authentication

- Added `GET /api/v1/ping` endpoint with API key auth — used by `ax init` to validate keys
- Fixed CLI `Ping()` which was hitting `/api/v1/repos` (session-auth only), causing all API key validations to fail with 401

---

## 2026-04-12 — Dashboard performance improvements

**Pages updated:** dashboard, rails-server

**Summary:** Fixed multiple performance issues causing >2s page loads on Vercel:
1. **Sidebar Suspense**: Wrapped the root layout Sidebar in `<Suspense>` with a skeleton fallback so page content streams immediately instead of waiting for sidebar API calls. Parallelized `getCurrentUser()` and `listReposAsync()` with `Promise.all`.
2. **Fetch revalidation**: Replaced `cache: "no-store"` with `next: { revalidate: 60 }` on all GET fetches in `db.ts` and `auth.ts`. Mutations still use `no-store`. This eliminates redundant cross-cloud round trips on repeated loads.
3. **Compare page waterfall**: Refactored `compare/page.tsx` from 4 sequential API calls (each fetching the full PR list) to a single fetch with local computation. Exported `computeAggregatesFromPRs` from `db.ts`.
4. **Single-PR endpoint**: Added `GET /api/v1/prs/:id` (Rails `PrsController#show`) so the PR detail page fetches one PR instead of all PRs. Access is checked against the user's org membership. Updated dashboard `getPRWithMetricsAsync(id)`.
5. **Animation delay cap**: Capped staggered row animation delays in the PR list at 500ms so large lists don't feel artificially slow.

---

## 2026-04-12 — Dashboard settings page polish (GitHub App Phase 7)

**Pages updated:** dashboard

**Summary:** Polished the GitHub App installation card on the org settings page. Added: connected repos list (collapsible, shows `owner/repo` for each repo tied to the installation), syncing indicator (pulsing dot when `last_synced_at` is null, indicating backfill in progress), reinstall button for suspended installations alongside the existing "Resume on GitHub" link, auto-dismissing success banner (8s timeout), human-readable error messages for known failure codes. Rails API now includes a `repos` array in the `GET /github_installation` response. Added spec coverage for repos inclusion.

---

## 2026-04-12 — Backfill job for new installations (GitHub App Phase 6)

**Pages updated:** rails-server

**Summary:** Added `GithubApp::BackfillInstallationJob` which runs after a GitHub App installation is saved. It fetches all repos accessible to the installation, upserts `Repo` records, and backfills PRs from the last 90 days (configurable) by reusing existing webhook handlers (`PrOpened`, `PrMerged`, `PrClosed`). This means a new org sees finalized metrics on the dashboard immediately after installing the GitHub App, without waiting for `ax push`. The job retries on rate limits and server errors with polynomial backoff. Both the setup callback controller and the `InstallationCreated` webhook handler trigger the job (whichever completes with an org link first), and the handlers are idempotent so duplicate runs are safe.

---

## 2026-04-12 — Installation-scoped webhook processing (GitHub App Phase 5)

**Pages updated:** rails-server

**Summary:** PR/review/CI webhook events are now scoped to GitHub App installations. `ProcessGitHubWebhookJob` resolves the `installation.id` from each payload and only dispatches to handlers when the installation is active (or absent for legacy/CLI-pushed repos). Unknown or suspended/deleted installations are dropped with a warning log. `find_repo` in `WebhookHandlers::Base` now prefers repos belonging to the installation's org before falling back to unscoped lookup.

---

## 2026-04-12 — API key reveal, invite management UI, and onboarding flow

**Pages updated:** authentication, dashboard

**Summary:** Added three features for the new-user onboarding journey:

1. **API key reveal endpoint** — `GET /api/v1/api_key/reveal` returns the raw API key via a cache-based one-time-read mechanism. Raw key is cached for 1 hour on creation/rotation, deleted after first read. Enables the onboarding page and settings page to display the key.

2. **Onboarding flow redesign** — `/onboarding` is now a 4-step guided experience: welcome, API key display (with copy button), CLI install instructions (pre-filled with actual key), and completion CTA. Implemented as server component wrapper + client stepper component.

3. **Invite & member management UI** — `/{slug}/settings` now has full member list (with role change dropdowns and remove buttons for admins) and invite management (create form, pending list, revoke, copyable invite links). Added Settings nav link to sidebar. Relaxed Rails permissions: members and invites index endpoints now require org membership (not admin), while mutations still require admin.

4. **API proxy route** — Added `dashboard/src/app/api/v1/[...path]/route.ts` catch-all proxy that forwards client-side fetch calls to Rails API with `_ax_session` cookie → `X-Ax-Session` header translation.

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
