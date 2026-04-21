# Wiki Log

Append-only record of wiki changes. Newest entries first.

---

## 2026-04-20 — Fix concurrency race conditions in finalization and plan limits

**Pages updated:** `wiki/rails-server.md`, `wiki/data-model.md`
**What changed:** PrMerged/PrClosed handlers now acquire a row lock on PrMetrics before the GitHub API fetch, preventing redundant API calls from concurrent webhooks. PushService verifies plan repo limits after insert with org row lock to prevent concurrent pushes from exceeding limits. GitHub webhooks now deduplicated via `processed_github_events` table (same pattern as Stripe), using the `X-GitHub-Delivery` header captured by the controller.

---

## 2026-04-20 — Push state tracking to avoid re-sending sessions

**Pages updated:** `wiki/go-cli.md`
**What changed:** Added `cli/internal/state/` package that tracks pushed session IDs per repo at `~/.ax/state/<owner>-<repo>.json`. Both `ax push --repo` and `ax push --all` now filter to only new sessions before parsing and sending. Added `--force` flag to bypass state and re-send everything. Updated commands table, package structure, and key files.

---

## 2026-04-20 — Fix Stripe billing edge cases

**Pages updated:** `wiki/rails-server.md`
**What changed:** Fixed four billing edge cases: (1) `SubscriptionUpdated` now creates a minimal subscription record when `subscription.updated` arrives before `checkout.session.completed` (looks up org via `stripe_customer_id`). (2) `BillingController#checkout` wraps the checkout flow in `@org.with_lock` to prevent concurrent double-checkout race conditions. (3) New `ReconcileSubscriptionSeatsJob` runs daily at 5am comparing subscription quantity to actual member count and adjusting; `SeatService.remove_seat!` now retries once on transient Stripe errors. (4) `InvoicePaymentFailed` handler now marks the subscription as `past_due` instead of only logging.

---

## 2026-04-20 — Dashboard test coverage with Vitest

**Pages updated:** `wiki/dashboard.md`
**What changed:** Added Vitest as the test framework for the dashboard. Created `vitest.config.ts`, added `npm test` script. Extracted duplicated metric utility functions (`percentile`, `extractPRValues`, `filterByRange`, `aggregateByDay`, `computeDistribution`) from both app and demo metric detail pages into `src/lib/metric-utils.ts`. Added 78 unit tests across 3 test files covering `computeAggregatesFromPRs`, `getPRSize`, `orgApiPath`, `formatMetricValue`, `getMetricDef`, and all extracted metric utilities. Added `dashboard-test` CI job. Updated pre-push checks to include `npm test`.

---

## 2026-04-20 — Accessibility fixes (contrast, reduced-motion, ARIA)

**Pages updated:** `wiki/dashboard.md`
**What changed:** Added `prefers-reduced-motion` support in `globals.css`. Increased StateBadge tone background opacity from `/15` to `/25` for WCAG AA contrast. Added `role="group"`, `aria-label`, and `aria-pressed` to RangeToggle. Added `aria-label` to RepoFilter trigger. Added `aria-live` region to CopyButton for state change announcements. Added optional `label` prop to Sparkline for screen-reader trend summaries. Added `scope="col"` to TableHead component. Darkened `muted-foreground` from `#6f6454` to `#6a5f4c` for AA compliance at 13px on muted backgrounds. Updated THEME.md contrast ratios to match.

---

## 2026-04-20 — Account deletion endpoint (GDPR Article 17)

**Pages updated:** `wiki/rails-server.md`
**What changed:** Added `DELETE /api/v1/account` endpoint with `AccountDeletionService`. Deletes the user, their personal org, sessions, and API keys. Anonymizes authored PRs/commits/sessions (replaces username with "deleted-user"). Blocks deletion if user is sole owner of a non-personal org (returns 409 with org list). Dashboard settings page now includes a "Delete Account" section with confirmation dialog.

---

## 2026-04-20 — SHA-256 digest for API key authentication

**Pages updated:** `wiki/authentication.md`
**What changed:** Added `key_digest` column (SHA-256, unique index) to `api_keys` table for O(1) API key lookup. `ApiKey.authenticate` now computes a SHA-256 digest and does an indexed lookup instead of iterating all keys with BCrypt. Legacy keys without a digest fall back to BCrypt scan and get backfilled on successful auth. `generate_for` stores the digest alongside the BCrypt hash on creation.

---

## 2026-04-19 — Remove Review Cycle Time metric

**Pages updated:** `wiki/metrics.md`, `wiki/data-model.md`, `wiki/data-flow.md`
**What changed:** Removed Review Cycle Time (minutes from PR open to first human review) from the product. It measured team review latency, not agent output quality. Removed: `first_review_at` and `review_cycle_time_minutes` columns from `pr_metrics` (via migration), `ReviewSubmitted` webhook handler and its spec, `backfill_reviews` from `Backfillable` concern, `list_pull_reviews` from `GithubApp::Client`, `pull_request_review` event routing from `ProcessGitHubWebhookJob`, `review-cycle-time` from `MetricsAggregator::METRIC_COLUMNS` and dashboard `METRIC_FIELDS`, metric definition from `metric-defs.ts`, MetricCard from all 6 overview pages (org, me, team, and demo equivalents), PR detail display, mock data generation, marketing copy, and metric doc. Output Quality grid reverted from `grid-cols-4` to `grid-cols-3`. Total metrics: 10 → 9.

---

## 2026-04-19 — Expose all 10 metrics on overview pages + remove Unmerged Token Spend

**Pages updated:** `wiki/dashboard.md`, `wiki/metrics.md`, `wiki/data-model.md`, `wiki/rails-server.md`, `wiki/index.md`
**What changed:** Added Review Cycle Time card to the Output Quality section on all 6 overview pages (org, me, team, and their demo equivalents). Output Quality grid changed from `grid-cols-3` to `grid-cols-4`. Added `review-cycle-time` to Rails `MetricsAggregator::METRIC_COLUMNS`, dashboard `METRIC_FIELDS`, and mock `SPARKLINE_CONFIGS`. Updated skeleton counts on me and team pages from 3 to 4 for the first category. Removed Unmerged Token Spend metric entirely: deleted `RepoMetrics` model, `repo_metrics` table (via migration), `repo-metrics` API endpoint, `RepoLevelMetrics` TypeScript type, `RepoMetricsData` Go struct, metric doc, and all references across wiki, docs, README, CLAUDE.md, and ADR-015.

---

## 2026-04-19 — Date PRs by merge/close date instead of finalized_at

**Pages updated:** `wiki/metrics.md` (MetricsAggregator description)
**What changed:** `MetricsAggregator` now windows and buckets PRs by `COALESCE(prs.merged_at, prs.closed_at)` instead of `finalized_at`. `finalized_at` is an internal processing timestamp that can differ from the actual PR terminal date (e.g., during backfill or reconciliation). Dashboard metric detail pages and PR detail page also updated to use `merged_at`/`closed_at` instead of `finalized_at` for date display. Added `closed_at` to the dashboard `PR` TypeScript interface.

---

## 2026-04-19 — TTFB performance optimization (Edge Runtime, caching, region alignment)

**Pages updated:** `wiki/dashboard.md` (added Performance section, fixed `src/middleware.ts` → `src/proxy.ts` reference)
**What changed:** Added `export const runtime = "edge"` to all app pages that don't use Node.js APIs (12 pages + 7 demo pages) to eliminate serverless cold starts. Changed `getGithubInstallation()` default caching from `revalidate: false` to `revalidate: 60` (settings page bypasses cache when returning from GitHub App install). Fixed `fetchAPI` to use static import for `next/headers` cookies instead of dynamic `await import()`. Set Vercel function region to `sfo1` in `vercel.json` to colocate with Railway us-west. The 3 metric detail pages remain on Node.js runtime because they use `fs` to read markdown docs.

---

### 2026-04-19 — FCP optimization: edge redirect, deferred top loader, CSS inlining
- **dashboard.md**: Updated proxy description (was referencing `src/middleware.ts`, now correctly `src/proxy.ts`). Added `_ax_last_org` cookie edge-redirect behavior. Updated navigation progress bar entry — `nextjs-toploader` is now dynamically imported via `src/components/top-loader.tsx` with `ssr: false`.
- **Files changed**: `src/proxy.ts` (edge redirect for auth'd users), `src/app/layout.tsx` (deferred top loader), `src/components/top-loader.tsx` (new client wrapper), `next.config.ts` (poweredByHeader, optimizePackageImports, inlineCss).

---

## 2026-04-19 — Add "Create Team" button to teams index page

**Pages updated:** (none — no wiki page changes needed)
**What changed:** The teams index page (`/{slug}/teams`) now shows a "Create Team" button for admin/owner users. When there are zero teams, the empty state displays the button prominently with an icon and actionable copy instead of directing users to org settings. When teams exist, the button appears in the page header. A new `CreateTeamButton` client component handles the dialog and API call. Demo app updated to match.

---

## 2026-04-19 — Add "My Dashboard" personal view

**Pages updated:** dashboard, rails-server
**What changed:** Added user-scoped "My Dashboard" view (`/{slug}/me`) with overview, PR list, and metric detail pages that show only the current user's data. Added Rails API endpoints (`/api/v1/orgs/:slug/me/prs` and `/me/metrics`) in new `MeController`, following the team-scoped pattern. Added `listMyPRsAsync()` and `getMyMetricsAsync()` to the dashboard data layer. Added "My Dashboard" nav link to sidebar between Overview and Pull Requests. **Why:** Users need to view their own metrics separately from org/team aggregates.

---

## 2026-04-19 — Two-path onboarding flow (AUS-135)

**Pages updated:** dashboard
**What changed:** Redesigned onboarding into two distinct paths. **Admin path** (new user signup): 5-step wizard — welcome, GitHub App install (opens in new tab), API key + CLI install, invite team members, and an "all set" landing with docs link. **Member path** (invite acceptance): 3-step wizard — welcome, API key + CLI install, all-set landing. Moved onboarding from `(app)` route group to its own `(onboarding)` route group so it renders full-screen without the sidebar. Changed invite acceptance (`/invite/[token]`) to redirect to `/onboarding?org=<slug>&role=member` instead of directly to the org dashboard. Improved empty states on the org overview page (`NoDataState`, `NoFinalizedPRsState`) with warmer copy and docs links.

---

## 2026-04-19 — Simplify SectionDivider

**Pages updated:** dashboard
**What changed:** Simplified SectionDivider from axis-rule-and-dot motif (left tick + horizontal + dot + serif label + rule + right tick) to a minimal dot + sans-serif label + rule. Removed end ticks and extra horizontal element. Changed label from `font-serif` to sans-serif (default). **Why:** Reduce visual noise — the ticks added complexity without aiding readability. Sans-serif labels match the rest of the UI better.

---

## 2026-04-18 — Sidebar navigation restructuring

**Pages updated:** dashboard
**What changed:** Restructured sidebar navigation to reduce clutter and separate concerns. Removed Org Settings, Billing, and Docs from the main nav — they now live in a user dropdown menu in the sidebar footer (Org Settings and Billing only visible for admin/owner roles, determined via `getGithubInstallation`). Removed "Filter by Repo" from the sidebar entirely — repo filtering is now an inline `RepoFilter` dropdown component (`src/components/repo-filter.tsx`) rendered in page subtitle areas (overview, PRs, metric detail) using the `?repo=` query param. Sidebar now contains only: logo, OrgSwitcher, Overview, Pull Requests, Teams (Pro orgs), and the user footer. Demo sidebar updated to match. **Why:** The sidebar was mixing navigation, filtering, admin settings, and external links in one flat list, creating cognitive load. With Teams added, this became worse. The restructuring organizes by frequency of use — high-frequency nav items in the sidebar, low-frequency admin items in a menu, filtering in the content area where it contextually belongs.

---

## 2026-04-18 — Teams within organizations

**Pages updated:** data-model, rails-server, dashboard
**What changed:** Added Teams as a sub-grouping within Organizations (Pro plan only). Two new tables: `teams` (name, slug unique within org, optional parent_team_id for hierarchy, created_by_id) and `team_memberships` (joins teams to org_memberships, not users directly, with org validation). New models `Team` and `TeamMembership` with associations on Organization, OrgMembership, and User (`teams_in(org)`). Team has `descendant_team_ids` (recursive CTE), `member_github_usernames` (includes descendants), `direct_member_count`. Plan capability `teams: false` (free) / `teams: true` (pro). Server: 11 new API endpoints under `/api/v1/orgs/:slug/teams` — CRUD, team-scoped PRs and metrics (reuses MetricsAggregator filtered by member GitHub usernames), and member management. Authorization: admins manage all teams, members can only access their own teams. BaseController gains `find_team!`, `find_team_as_admin!`, `team_member?`, `require_teams_feature!`. Extracted `PrSerialization` concern from 3 controllers. Dashboard: 5 new routes (`/{slug}/teams`, `/{slug}/teams/{team}`, `/{slug}/teams/{team}/prs`, `/{slug}/teams/{team}/metrics/{metric}`, `/{slug}/settings/teams/{team}`), TeamsSection in org settings (create/delete), TeamEditForm (edit name, manage members), Teams group in sidebar (Pro orgs only). **Why:** Teams let organizations slice their metrics by sub-groups (frontend, backend, platform, etc.) without creating separate orgs, supporting the team-reflection ethos at a more granular level.

---

## 2026-04-17 — Dashboard card redesign + time range toggle

**Pages updated:** dashboard
**What changed:** Redesigned metric cards from flat layout to "stacked narrative" (Option C): label, value, delta pill, hero sparkline (h-16, was h-6), detail text. Sparkline component now uses 200x64 viewBox with subtle area fill. Added 7d/30d/90d range toggle (segmented control in page header, `?range=` query param, default 30d). Range controls sparkline window, delta comparison period, and PR count. Backend `MetricsAggregator` now accepts `window_days:` keyword (7, 30, or 90) instead of hardcoded 7-day window + 30-day sparkline. Delta format changed from "wk/wk" to "vs prior {range}". Mock data generators parameterized for variable sparkline lengths. **Why:** The sparkline — the most compelling data on the dashboard — was too small to read trends. Users need to answer "how are we doing now?" and "what is our trend?" at different time horizons.

---

## 2026-04-16 — Mock data mode for UI iteration

**Pages updated:** dashboard, conventions
**What changed:** Added `MOCK_DATA=true` mode that lets the dashboard run locally without a Rails backend or GitHub OAuth. Intercepts at 4 chokepoints: `getCurrentUser()` returns a mock user, `fetchAPI()` routes to a local mock data module, middleware skips auth, and the API proxy returns mock responses. Mock data includes 150 PRs across 3 repos with realistic metric distributions, 30-day sparklines with tuned trends, 4 org members, billing info, and GitHub installation. Run with `just dashboard-mock` or `npm run dev:mock`. **Why:** UI iteration workflow required starting the Rails server and authenticating via GitHub, which is too heavy for styling and component work.

---

## 2026-04-16 — Sunk card surfaces, remove card border strokes

**Pages updated:** dashboard
**What changed:** Card surfaces switched from white (`#FFFFFF`) to wellstone (`--color-wellstone`, `#F3EDE0`) in light mode and from midnight-raised to midnight-sunk in dark mode. Cards now appear slightly darker/sunk against the page background instead of raised-white. Visible border stroke removed from base Card component (replaced with `border-transparent` so overrides like the Pro plan card's `border-primary/40` still work). Removed the `surface` prop from overview MetricCard since all cards now share the same sunk surface. Updated THEME.md with new card surface guidance. **Why:** Aligns the dashboard's card treatment with the reference palette's "UI in context" pattern — lighter background with sunk cards, no visible stroke.

---

## 2026-04-16 — Fix CI success rate data gaps + automatic reconciliation

**Pages updated:** metrics, data-flow
**What changed:** Fixed two bugs causing CI success rate data to be missing for most finalized PRs. (1) `GithubDataFetcher#fetch_ci_status` had an all-or-nothing guard that skipped all CI data when any check suite was in-progress at finalization time (common — merging triggers new CI runs). Now evaluates completed suites immediately and defers in-progress ones. (2) `CiCompleted` webhook handler relied on GitHub's `check_suite.completed` payload `pull_requests` array for PR lookup, which GitHub often leaves empty for merged PRs. Now uses `commit.pr` association instead. Added `ReconcileCiDataJob` (runs every 6 hours via Solid Queue) that backfills `ci_passed` for commits on finalized PRs that were missed at finalization time, then recomputes `ci_success_rate` for any PR where the rate is still nil but commit data now exists. **Why:** CI success rate was almost always nil because finalization and webhook delivery consistently fell into the gap between these two code paths.

---

## 2026-04-16 — Overview page visual refresh + windowed metrics API

**Pages updated:** dashboard, metrics, rails-server, data-flow
**What changed:** Overview page visual refresh: metric values switched from `font-mono` to `font-serif` with `lining-nums tabular-nums` for field-notebook aesthetic; section headers replaced with `SectionDivider` component (AX axis-rule-and-dot motif — ticks + rule in `muted-foreground`, single clay dot, serif caps label); first card per section gets `bg-secondary` for visual rhythm. New `Sparkline` component (hand-rolled SVG, null-gap handling, auto-suppression). Week-over-week delta indicators (arrow + magnitude in `muted-foreground`, no status colors — per design philosophy). Backend: extracted `MetricsAggregator` service from inline controller SQL. Metrics aggregate endpoints now window to 7-day current + 7-day prior periods (was all-time). API response restructured from flat fields (`avgPostOpenCommits`, `ciSuccessRate`, etc.) to `{ totalPRs, sessionDataCount, metrics: { [slug]: { current, prior, sparkline: [{t, v}] } } }`. Dashboard `AggregateMetrics` interface and `computeAggregatesFromPRs` updated to match. **Why:** the Parchment & Clay palette migration delivered the color story but the overview page still felt flat — uniform card grid, mono numerals, no trend data. This adds visual hierarchy (serif values, motif dividers, surface variation) and temporal context (sparklines, deltas) without introducing status-color verdicts.

---

## 2026-04-16 — Parchment & Clay migration: Phase 6 verification sweep

**Pages updated:** dashboard
**What changed:** Final cleanup pass for the Parchment & Clay migration. Verified zero remaining references to the old token vocabulary (`--color-void`, `--color-surface-*`, `--color-text-primary|secondary|tertiary`, old `--color-accent`, `--color-green|red|purple|amber`) and the old hex leakage (`#6366F1`, `#1F1F2E`, `#252536`, `#E8E8ED`, `#56566A`) across `dashboard/src/`. Zero `dark:` Tailwind variants remain in `dashboard/src/app/**`; the only remaining `dark:` usages are inside shadcn primitives under `src/components/ui/` (ships that way upstream) and in `theme-toggle.tsx` for the sun/moon icon rotation, which is animation behavior rather than a color remap — both legitimate. Orphaned CSS rules (`.metric-card`, `.tooltip-*`, `.animate-in`) were already removed in Phase 0 and have no JSX references; `globals.css` now holds only the theme, base layer, and the scrollbar rule. `src/components/org-switcher.tsx` stays in place — Phase 1 rewrote it as a thin composition over shadcn `Popover` + `Command`, so it is no longer a hand-rolled primitive and doesn't need to be deleted. Updated the `wiki/dashboard.md` Key Files entry for `globals.css` to describe its actual contents (theme block + tokens + `.dark` overrides + base layer) — the stale "animations" descriptor is gone. **Why:** close out the migration plan with an explicit verification that the acceptance criteria from `plans/dashboard-theme-migration.md` hold — no surprises lurking in a forgotten corner, and the wiki accurately describes the final state.

---

## 2026-04-16 — Migrate authenticated app routes + chart to Parchment & Clay (Phase 4 + Phase 5)

**Pages updated:** dashboard
**What changed:** Every route under `(app)/` now renders through Parchment & Clay semantic tokens, and the lone chart component has been rebuilt on the shadcn `chart` primitive (Phase 5 folded in). Five new shadcn primitives installed: `table`, `label`, `select`, `progress`, `alert`, `chart`. Route-by-route: org overview (`[slug]/page.tsx`) and PR detail metric cards rebuilt on shadcn `Card` + `Tooltip` with metric values in `text-foreground` (never `text-primary` — ADR-006 "user decides what's good"); metric detail (`metrics/[metric]/page.tsx`) uses shadcn `Table` + `Badge` + `Card`, category chips switched to the neutral `outline` Badge (categories are metadata, not status); PR list and detail (`[slug]/prs`, `/prs/[id]`) adopt shadcn `Table`; diff counts on PR detail use `success` (+) and `attention` (-) per THEME.md §3. Settings (both `[slug]/settings` and `/settings`), billing, and onboarding all migrated — `GitHubAppCard`, `MembersSection`, `InvitesSection`, `BillingCard`, `ApiKeySection`, `LogoutButton`, `OnboardingSteps` now compose shadcn `Card` / `Button` / `Input` / `Label` / `Select` / `Avatar` / `Progress` / `Alert`. A shared `StateBadge` component (`src/components/state-badge.tsx`) maps GitHub PR state onto the non-judgmental status palette (merged → success / olive, open → info / dusk, closed → attention / russet, draft → muted); reused across the metric table, PR list, and PR detail header. `MetricBarChart` rewritten on shadcn `ChartContainer` + `ChartTooltip` + `ChartTooltipContent`; the hardcoded hex colors (`#6366F1`, `#1F1F2E`, `#252536`, `#E8E8ED`, `#56566A`, `rgba(255,255,255,0.03)`) are gone, replaced by CSS-variable reads through `chartColor()`; takes a `colorSlot` (1..8) instead of a hex prop and brightens automatically in dark mode. Category → chart-slot mapping uses 1 (clay), 2 (dusk), 3 (olive), 4 (ochre) per THEME.md §3. `getPRSizeColor` collapsed to a single neutral `bg-muted` chip — PR size is informational, not a verdict. `src/components/skeleton.tsx` rebuilt on shadcn `Skeleton` + `Card` + `Table`, preserving export names so no `loading.tsx` has to change shape; the remaining `loading.tsx` files that inlined `border-border-subtle bg-surface-1` swept onto Card + Table primitives. `BooleanMetricSummary` switched to `bg-success` + `bg-muted` for its proportion bar, per ethos. `CopyButton` rebuilt on shadcn Button (secondary). On the onboarding flow the hand-rolled "ax" bubble gave way to the brand `<Mark>` component and section titles adopt serif per THEME.md §4. Zero references to `bg-surface-*`, `text-text-*`, `border-border-subtle`, `text-accent-hover`, `bg-accent-muted`, literal `text-green|red|purple|amber`, `metric-card`, `animate-in`, or old-palette hex remain in `src/app/(app)/`. **Why:** Phase 4 was the last content surface still rendering on the old palette, and the chart was the single biggest remaining visual leak (alongside the state pills). Folding Phase 5 into Phase 4b was cheap — the chart component is touched by the metric detail page and only loads there, so migrating them together avoided a split PR that would have left the chart visually off-palette for one merge cycle. The migration is skin-deep: no route shapes, Suspense boundaries, or data-fetching patterns changed.

---

## 2026-04-16 — Migrate auth & invite routes to Parchment & Clay (Phase 3)

**Pages updated:** dashboard
**What changed:** `/login` and `/invite/error` now render through Parchment & Clay semantic tokens. `/login/page.tsx` drops the hand-rolled centered card, bespoke "ax" logo bubble, and hand-styled GitHub OAuth anchor in favor of shadcn `Card` + `Button` (terracotta `default` variant, `size="lg"`) composed around the brand `<Mark>` component; title uses `font-serif` (editorial moment per THEME.md §4); legal/data-collection footnote uses `text-muted-foreground` with hover-to-foreground underlined links. `/invite/error/page.tsx` rebuilt on shadcn `Card` + `Badge` + `Button`: header carries a `Badge` using the `attention` token (russet, "Heads up") to preserve the non-judgmental ethos — never `destructive`, per the plan; footer has an outline Button → `Continue to dashboard`. The GitHub brand SVG is inlined in the login page with a WHY comment: Lucide intentionally omits branded logos for trademark reasons (the project's installed lucide-react v1.8.0 has no `Github` export). Route handlers `/auth/accept`, `/auth/logout`, `/invite/[token]` have no UI and were not touched. Zero remaining old-token references in the two migrated pages (no `bg-void`, `bg-surface-*`, `text-text-*`, `border-border-subtle`, bespoke `bg-accent`, literal hex, or `dark:` variants). **Why:** these are the last doorways into the app surface that still rendered on the old indigo-void palette; closing them means every externally-reachable entry point (login, invite handoff, error landings) now greets users in Parchment & Clay before they hit the authenticated routes (Phase 4).

---

## 2026-04-16 — Migrate marketing & docs routes to Parchment & Clay (Phase 2)

**Pages updated:** dashboard
**What changed:** Every route under `(marketing)/` — `/`, `/docs`, `/docs/[slug]`, `/docs/data-collection`, `/plans`, `/setup`, `/changelog`, `/terms` — now renders through Parchment & Clay semantic tokens (`foreground`, `muted-foreground`, `card`, `border`, `primary`, `accent`, `success`, `notice`, `attention`, `info`). Zero remaining references to `text-text-*`, `bg-surface-*`, `border-border-subtle`, `bg-accent-hover`, or literal red/green status classes across these routes. Shadcn `Card`, `Badge`, and `Button` primitives replace the hand-rolled card/pill/button HTML on every page (two new primitives installed: `card`, `badge`). Lucide icons (`FileText`, `Shield`, `ChevronLeft`, `Check`) replace inline SVG glyphs in the docs routes. Serif applied to top-level page titles (landing hero, `/docs`, `/plans`, `/setup`, `/changelog`, `/terms`) and to section headings that act as editorial moments on the landing page and `/setup`; changelog entry dates use serif italic. `/plans` Pro card carries a `Badge` using the `notice` (ochre) token for "Recommended" instead of recoloring the card border as a primary accent — preserves primary's scarcity per THEME.md §4. `/changelog` tag pills use `info` (feature), `attention` (fix), `success` (improvement), replacing the old red/green split. `/plans` feature-table checkmark uses the `success` token, not literal green. Shared `Markdown` component (consumed by `/docs/[slug]` and `/docs/data-collection`) rewritten against semantic tokens; serif on `h1`/`h2`. No `@tailwindcss/typography` dependency introduced — custom per-tag components are still explicit. **Why:** the shells landed in Phase 1, so every marketing/docs page now lives inside a properly themed header + footer; switching the page bodies completes the marketing surface in the new palette. Primitive adoption keeps focus rings, disabled states, and hover affordances consistent with the authenticated app that lands in Phase 4.

---

## 2026-04-16 — Migrate app & marketing shells to shadcn primitives (Phase 1)

**Pages updated:** dashboard
**What changed:** The two long-lived layouts now render through shadcn primitives. `(app)/layout.tsx` drops the hand-rolled 220px sidebar in favor of shadcn `Sidebar` + `SidebarProvider` + `SidebarInset`, with lucide icons replacing the inline SVG glyphs (`Home`, `GitPullRequest`, `Settings`, `CreditCard`, `BookOpen`). Data fetching (org slug from `x-pathname`, `getCurrentUser`, `listReposAsync`) still runs server-side and streams into the shell under a Suspense boundary that now uses `SidebarMenuSkeleton`. The nav, repo filter, and user menu are preserved; the user footer picks up the `ThemeToggle` next to the avatar, and a mobile `SidebarTrigger` handles the collapsed state on small screens. `(marketing)/layout.tsx` swaps the bespoke header for shadcn `NavigationMenu` + outline/primary `Button`s (Sign in + Get Started kept as distinct CTAs) and the footer for a composition of `Separator` + `ThemeToggle`. `OrgSwitcher` is rebuilt on shadcn `Popover` + `Command` — the hand-rolled click-outside logic is gone; it now receives `currentSlug` from the sidebar so the active org is highlighted with a check and navigates via `next/navigation`. Root-layout `NextTopLoader` color flips from hex `#B0602F` to `var(--color-primary)` so the bar follows the theme. **Why:** these shells sit above every route, so rebuilding them on shadcn primitives lets every later phase inherit consistent spacing, focus rings, tooltips, and dark-mode remap without per-page work.

---

## 2026-04-16 — Parchment & Clay theme + shadcn/ui adoption (Phase 0 foundation)

**Pages updated:** dashboard, conventions
**Decisions added:** 015-design-system-and-shadcn; ADR-006 amended (principles unchanged, palette and mode defaults changed)
**What changed:** The dashboard's design system moves from the Linear-inspired indigo-on-dark "Void" palette to the warm **Parchment & Clay** palette (light default, terracotta `#B0602F` hero, earthy olive/ochre/russet/dusk status colors). Theme tokens now live in `dashboard/src/app/globals.css` (the old `design-system/theme.css` + `THEME.md` have been promoted out of that directory — CSS into `globals.css`, guide into `dashboard/THEME.md`, and `design-system/` deleted). Semantic tokens follow shadcn/ui conventions so primitives drop in without remapping. Dark mode is first-class and user-toggleable via `next-themes` + a new `ThemeToggle` component (`src/components/theme-toggle.tsx`); `ThemeProvider` wraps the root layout. Geist webfont (previously loaded from a CDN) is gone — fonts use the theme's system-first sans stack, Iowan Old Style / Charter / Source Serif 4 for `font-serif`, no webfonts loaded. The `nextjs-toploader` color in `src/app/layout.tsx` switched from indigo `#6366F1` to Clay-500 `#B0602F`. shadcn/ui is installed (base primitives lazy-added: `button`, `dropdown-menu`; more to land as each route migrates); `clsx` + `tailwind-merge` wired through `src/lib/utils.ts` (`cn` helper); `lucide-react` is the icon library; `src/lib/chart-theme.ts` is a Phase 5 helper for recharts color refs. **Brand assets** landed too: `dashboard/brand-assets/` holds the authoritative SVG sources and a README with the brand contract (ink + clay only, never recolor ticks, specific clear-space and min-size rules). Staging subdirs (`next-app/`, `react/`, `png/`) and `preview.html` were deleted after install to avoid drift — installed copies are single-source-of-truth in the app. The `<Mark>`, `<Wordmark>`, and `<Logo>` React components are installed at `src/components/logo/`. Next.js file-convention metadata files (`icon.svg`, `icon.png`, `favicon.ico`, `apple-icon.png`, `opengraph-image.png`, `twitter-image.png`, `manifest.webmanifest`) sit at `src/app/` and are auto-picked-up. PWA icons live at `public/ax-icon-*.png`. `--ax-clay` is aliased to `--color-primary` in `globals.css` so the logo accent themes automatically. Browser chrome `themeColor` declared via a new `viewport` export in `layout.tsx` (`#FAF5EC` light / `#14110C` dark); metadata gains a `title.template` of `"%s · AX"`. This is the foundation PR — existing routes still use the old `.metric-card` / `.tooltip-*` / `.animate-in` classes and old `--color-surface-*` tokens, so they will render visually broken until their follow-up phases migrate them. Full migration plan in `plans/dashboard-theme-migration.md`. **Why:** the old palette read as performance-review / leaderboard territory, which works against AX's team-reflection ethos; hand-rolled primitives (no Button, Dialog, DropdownMenu, Select, Tabs, Tooltip) caused drift and slowed every UI change. Taking theme + component-library + brand-assets decisions together is strictly less work than doing them separately — the new palette was designed with shadcn-compatible token names and the brand assets derive from the same palette.

---

## 2026-04-16 — Remove developer comparison feature

**Pages updated:** dashboard, architecture
**What changed:** Removed the `/{slug}/compare` route and everything that fed it: the page and its `loading.tsx`, the `DeveloperSelector` and `TimeWindowPicker` filter components, the `TrendChart` / `Sparkline` chart components (only consumed by compare), the `author` field on the dashboard `PR` interface, and the `FilterOpts` / `DeveloperMetrics` types and `filterPRs`, `listDevelopersAsync`, `getFilteredMetricsAsync`, `getDeveloperComparisonAsync`, `getPercentile`, `getFilteredTimelineAsync` functions in `src/lib/db.ts`. The "Compare" sidebar nav link and `CompareIcon`, plus `"compare"` from `NON_ORG_SEGMENTS`, are gone from `src/app/(app)/layout.tsx`. The `compare_developers` capability was removed from `server/config/initializers/plans.rb` (free + pro), the `ax:override` example, the `PlanService` spec, the billing card's PRO_FEATURES list, the marketing `/plans` feature table, the marketing landing pricing teaser, and step 6 of the marketing setup guide. `plans/comparison-views.md` was deleted. **Why:** comparing individuals goes against the product ethos — AX exists to be the origin of *team* discussions about how to work better with agents, not to rank developers against each other. A future Pro+ "insights" capability will surface team-level workflow improvement suggestions to fill the same upgrade slot.

---

## 2026-04-16 — Stream dashboard pages via in-page Suspense

**Pages updated:** dashboard
**What changed:** Every data-driven `/(app)` page now renders its shell (headings, filter bars, table headers, back links, static doc content) synchronously and streams data-dependent sections through `<Suspense>` boundaries. Fetch promises are created at the page level without `await`ing; each async child awaits the promise it needs and React dedupes shared promises into a single network call. Per-section `SectionErrorBoundary` (new at `src/components/section-error-boundary.tsx`) scopes API failures to individual cards/tables instead of taking down the whole page — the previous page-level "No data yet" return was replaced by section-level fallbacks that leave unrelated shell content intact. Skeleton primitives extended with `SkeletonTableBody` and `SkeletonChartPanel`. Parallelized the last few sequential fetches: overview page now kicks off repo-label resolution and metrics fetch together, and settings/billing hold parallel multi-endpoint fetches behind per-card Suspense islands. The route-level `loading.tsx` files from the previous PR remain and still handle hard-navigation cases (slug change, cold route chunk) before the page function runs.

---

## 2026-04-16 — Fix billing webhook regression and duplicate-checkout race

**Pages updated:** rails-server
**What changed:** Three intertwined fixes:
1. **Pinned `Stripe.api_version`** in `config/initializers/stripe.rb` (default `2026-03-25.dahlia`, overridable via `STRIPE_API_VERSION`). The stripe-ruby v19 default had silently moved `current_period_start` / `current_period_end` off the `Subscription` object onto each subscription item, which caused `CheckoutCompleted` to crash with `NoMethodError`, leaving every paid upgrade stuck on `free`. Pinning keeps the wire format aligned with whatever version is configured on the Stripe webhook endpoint.
2. **Updated `CheckoutCompleted` and `SubscriptionUpdated`** to read `current_period_*` from `items.data.first`. `CheckoutCompleted` also now skips entirely when the Stripe subscription is already `canceled` (handles delayed redeliveries after manual cleanup of duplicate subs).
3. **New `POST /api/v1/orgs/:slug/billing/reconcile?session_id=…`** endpoint, called synchronously by the dashboard's `/{slug}/billing/success` route handler. Stripe's `success_url` now templates `{CHECKOUT_SESSION_ID}` so the browser carries the session id back. Reconcile retrieves the Checkout Session, asserts `metadata.org_id` matches the URL org, and reuses the same `CheckoutCompleted` handler — making the dashboard's view of the plan independent of webhook delivery latency. Idempotent with the webhook via the existing unique index on `subscriptions.stripe_subscription_id`.
4. **Defense-in-depth in `BillingController#checkout`** — even when the local `Subscription` row is missing, the controller now lists Stripe-side subscriptions on the customer and refuses if any are `active` / `trialing` / `past_due`. Fails closed on Stripe API errors. This closes the race that allowed a user to complete the same Pro subscription multiple times while the webhook hadn't yet caught up.

---

## 2026-04-16 — Add route-level loading skeletons + top navigation progress bar

**Pages updated:** dashboard
**What changed:** Every app route under `/(app)` now has a `loading.tsx` that Next.js renders instantly on navigation, before the server component's data awaits resolve. Skeletons mirror each page's real layout (overview metric grid, PR list table, metric-detail chart+table, PR detail grouped cards, settings cards, billing card, compare leaderboard). Added `nextjs-toploader` to `src/app/layout.tsx` — a 2px indigo progress bar at the top of the viewport during any client navigation. New shared primitives in `src/components/skeleton.tsx`: `Skeleton`, `SkeletonMetricCard`, `SkeletonMetricCategory`, `SkeletonTableRow`, `SkeletonPageHeader`. This is PR 1 of 2 on dashboard perceived-performance work; PR 2 will convert pages to Suspense-based streaming so the page shell renders before data arrives and data-heavy sections can stream in independently.

---

## 2026-04-16 — Fix Stripe success redirect crash

**Pages updated:** none (behavior equivalent, no user-visible wiki facts changed)
**What changed:** Stripe Checkout `success_url` now points to `/{slug}/billing/success` (a new dashboard route handler) instead of `/{slug}/billing?billing=success`. The handler calls `revalidatePath` to bust stale org-layout caches and then redirects to the billing page with `?billing=success` for the confirmation banner. Previously the page component called `revalidatePath` during render, which Next.js 16 disallows — the first post-checkout load crashed with a Server Components render error and only worked after a manual reload.

---

## 2026-04-15 — Move Pro to per-seat pricing ($20/seat/month)

**Pages updated:** data-model, rails-server, conventions, dashboard
**What changed:** Migrated Pro from flat-rate (single Stripe price, quantity 1, unlimited members) to per-seat ($20/seat/month). New columns on `subscriptions`: `stripe_subscription_item_id`, `quantity`. New `SeatService` orchestrates Stripe seat sync — `add_seat!` runs BEFORE membership creation (Stripe failure rolls back the membership), `remove_seat!` runs AFTER deletion (Stripe failure doesn't block, webhook reconciles). `PlanService` now resolves `max_members` from `subscription.quantity` for Pro instead of `Float::INFINITY`. `Invite#accept!` auto-purchases a seat on Pro when at the limit. Invite creation skips the limit check on Pro since seats auto-purchase on accept. `MembersController#destroy` calls `SeatService.remove_seat!`. Billing API response includes `quantity` and `seat_price_cents`. Dashboard shows seat count and monthly total on Pro. Stripe Customer Portal "Update subscription quantity" should be enabled.

---

## 2026-04-15 — Add Stripe webhook idempotency

**Pages updated:** rails-server, data-model
- rails-server: Documented idempotency mechanism in Stripe webhook handlers section
- data-model: Added `processed_stripe_events` table documentation

---

## 2026-04-15 — Session invalidation on membership removal and plan downgrade

**Pages updated:** authentication
**What changed:** Added session invalidation behavior to UserSession lifecycle documentation. Sessions are now destroyed when: (1) a user is removed from their last org via the members controller, and (2) an org downgrades to the free plan via `Organization#enforce_free_plan_limits!` (removes non-owner memberships, invites, and invalidates sessions). Wired into Stripe subscription handlers (`SubscriptionDeleted`, `SubscriptionUpdated`).

---

## 2026-04-15 — Enforce member limits on invite acceptance

**Pages updated:** authentication, rails-server
**What changed:** `Invite#accept!` now checks `max_members` plan limit before creating the membership, preventing invite acceptance from bypassing member limits when an org downgrades after the invite was created. Returns 403 from the accept endpoint. `AuthService.process_pending_invites` gracefully skips invites that would exceed the limit (login is not blocked). Uses row-level locking to prevent concurrent accepts from racing past the limit.

---

## 2026-04-15 — Enforce history_days cutoff on PR detail endpoint

**Pages updated:** rails-server, conventions
**What changed:** Added `history_days` capability to plan config (free: 30, pro: unlimited) in `config/initializers/plans.rb`. Added `history_cutoff` helper to `BaseController` that converts `history_days` to a cutoff timestamp. `PrsController#show` now returns 403 for PRs with `created_at_source` older than the cutoff. PRs without `created_at_source` are allowed through. Request specs added in `spec/requests/prs_spec.rb`.

---

## 2026-04-15 — Fix `message_count` documentation and add JSON parse logging

**Pages updated:** data-model, metrics
**What changed:** Fixed `message_count` column description in data-model wiki — was documented as "Human + assistant messages" but is actually human messages only (mapped from `session.HumanMessages` in Go CLI at `cli/internal/bulk/push.go:294`). Fixed corresponding "Messages per PR" metric description in metrics wiki. Also added targeted `JSON::ParserError` rescue with logging to `MetricsComputer#compute_plan_metrics` — previously `JSON.parse(json) rescue []` silently swallowed all parse errors.

---

## 2026-04-15 — Add Stripe billing and freemium plan system

**Pages updated:** data-model, rails-server, conventions, dashboard
**What changed:** Added freemium billing infrastructure with Stripe. New tables: `subscriptions`, new columns on `organizations` (`plan`, `stripe_customer_id`, `plan_overrides`). Config-driven capability model via `PlanService` with per-org overrides. Stripe Checkout, Customer Portal, and webhook handling (4 event types). Billing API endpoints (show/checkout/portal). Dashboard billing page at `/{slug}/billing` with plan badge, usage bars, and upgrade/manage buttons. Plan limits enforced on invite creation and repo creation. Rake tasks for manual plan management.

---

## 2026-04-15 — Finalization safety: transaction wrapping, pessimistic locking, idempotent timestamps

**Pages updated:** metrics
**What changed:** Fixed three finalization issues in `PrMerged` and `PrClosed` webhook handlers: (1) **P0 data loss** — if `GithubDataFetcher` or `MetricsComputer` raised during finalization, the PR was finalized with nil metrics that could never be updated. Now the fetch-compute-finalize flow is wrapped in a transaction; failures roll back and leave the PR unfinalized for retry by `ReconcileReposJob`. (2) **Race condition** — concurrent finalization from duplicate webhooks could both pass the `pr_finalized?` check. Now `finalize_metrics` uses `with_lock` and re-checks inside the lock. (3) **Timestamp drift** — webhook redelivery overwrote `finalized_at`. Now uses `metrics.finalized_at || Time.current` to preserve the original.

---

## 2026-04-15 — Fix CI Success Rate: per-commit tracking and backfill gap

**Pages updated:** metrics, data-model
**What changed:** CI Success Rate was missing data for most PRs because the backfill process never fetched check suite data, and a race condition between `PrMerged` and `CiCompleted` webhooks could skip CI data on finalized PRs. Fixed by: (1) adding `ci_passed` boolean to `commits` table, (2) fetching check suites per commit in `GithubDataFetcher`, (3) computing `ci_success_rate` in `MetricsComputer` as fraction of commits that passed CI, (4) rewriting `CiCompleted` handler to update per-commit status and recompute PR rate via `update_column` (bypasses finalization guard), (5) removing `ci_success_rate` from `GITHUB_DERIVED_FIELDS` so late-arriving webhooks can update settled PRs. Existing data can be repaired by running `rails backfill:installations`.

---

## 2026-04-14 — Add 4 new session-derived metrics

**Pages updated:** metrics, data-model
**Docs updated:** docs/decisions/001-metrics-selection.md
**Docs added:** docs/metrics/cache-hit-rate.md, docs/metrics/sidechain-rate.md, docs/metrics/re-read-rate.md, docs/metrics/autonomy-score.md

Added Cache Hit Rate, Sidechain Rate, Re-Read Rate, and Autonomy Score. These are computed from session data already collected (or with minimal new parser fields). Changes span Go CLI parser, push payload, Rails migration/ingestion, MetricsComputer, API endpoints, and dashboard metric definitions. Total metrics now 20.

---

## 2026-04-14 — Move Go CLI into cli/ subdirectory, switch to Justfile

**Pages updated:** architecture, conventions, go-cli, metrics
**What changed:** All Go CLI code (`cmd/`, `internal/`, `go.mod`, `go.sum`, `.goreleaser.yml`) moved into `cli/` to match `server/` and `dashboard/` layout. Replaced `Makefile` with `Justfile` (`cli/Justfile`) and added a root `Justfile` for cross-project commands. Updated all wiki path references from `cmd/ax/`, `internal/` to `cli/cmd/ax/`, `cli/internal/`. CI workflows updated to use `working-directory: cli`.

---

## 2026-04-14 — Metrics audit: fix broken metrics and implement planning metrics

**Pages updated:** metrics

**Bug fixes:**
- **Diff Churn**: Fixed always-0 bug. GitHub's list-commits API doesn't return per-commit stats — now fetches each commit individually via `GET /commits/{sha}` to get real additions/deletions
- **First-Pass Acceptance**: Fixed always-false bug. PRs with no reviews now default to `first_pass_accepted: true` at finalization (no reviews = accepted)
- **Test Coverage**: `has_tests` returns nil when PR only touches non-testable files (docs, CI, config, lock files), excluding them from aggregate rate calculations
- **Line Revisit Rate**: Added 7-day lookback window. Previously checked ALL finalized PRs ever, now only counts files changed in PRs merged/closed within last 7 days

**New features:**
- **Planning Metrics**: Implemented full pipeline — CLI extracts file path references from plan documents in `/plans/` directories, pushes them as `planned_files` in session data. Server compares against PR files from GitHub API after session-PR correlation. Computes `plan_coverage_score`, `plan_deviation_score`, and `scope_creep_detected`. Results stored in both `pr_metrics` and `plan_analyses` tables.

**Files changed:**
- `server/app/services/github_app/client.rb` — added `get_commit` method
- `server/app/services/github_data_fetcher.rb` — fetches individual commits for stats
- `server/app/services/metrics_computer.rb` — non-testable file filtering, 7-day revisit window, plan metrics computation
- `server/app/services/webhook_handlers/pr_merged.rb`, `pr_closed.rb` — default first_pass_accepted at finalization
- `server/app/services/session_pr_correlation_service.rb` — triggers plan metrics after correlation
- `server/app/controllers/api/v1/push_controller.rb` — permits `planned_files` array
- `server/app/services/push_service.rb` — stores planned_files
- `server/db/migrate/20260414000002_add_planned_files_to_coding_sessions.rb` — new column
- `cli/internal/api/types.go` — added PlannedFiles to SessionData
- `cli/internal/parsers/claude_sessions.go` — added ExtractPlannedFiles function
- `cli/internal/bulk/push.go` — sends planned files in push payload

---

## 2026-04-13 — Data collection disclosure page and README section

**Pages updated:** dashboard
**Files added:** `docs/data-collection.md`, `dashboard/src/app/docs/data-collection/page.tsx`
**Files updated:** `README.md`, `dashboard/src/app/layout.tsx`, `dashboard/src/app/login/page.tsx`, `dashboard/src/app/docs/page.tsx`

Added a transparent data collection disclosure covering exactly what the CLI collects, what is sent to the server, what GitHub webhooks provide, and what is explicitly not collected. Accessible from:
- Dashboard at `/docs/data-collection` (linked from docs index, sidebar footer, and login page)
- README "Data Collection" section with link to the full doc

---
## 2026-04-13 — Documentation accuracy audit and polish

**Pages updated:** metrics, rails-server
**Docs updated:** README.md, docs/setup.md, docs/metrics/index.md, docs/metrics/self-correction-rate.md, docs/metrics/context-efficiency.md, docs/metrics/error-recovery-efficiency.md

**Accuracy fixes:**
- README and setup guide: removed `--server` and `--user` flags from `ax init` — only `--api-key` is required (server URL defaults to `config.DefaultServerURL`)
- README: split "Interaction efficiency" into "Prompt Efficiency" and "Agent Behavior" to match the dashboard categories
- Setup guide: updated "Current limitations" table → "What's working today" — member/invite management UI is fully working, not a placeholder
- Setup guide: added `ax push --all` mention and dashboard page table (overview, drill-down, compare, org settings)
- wiki/metrics.md: fixed "Open PRs are excluded from the dashboard entirely" → progressive visibility (open PRs shown with pending indicator, aggregates use settled PRs only)
- wiki/metrics.md: fixed finalization section — records are not fully immutable; scoped write protection allows session-derived fields to update after settlement
- wiki/metrics.md: fixed Agent Behavior descriptions to match actual implementations (bash_successes/errors ratio, files_modified/read ratio, total bash_errors)
- wiki/metrics.md: replaced "being ported to Ruby" with the actual server-side services (MetricsComputer, SessionPrCorrelationService)
- wiki/rails-server.md: fixed `app.ax.dev` → `ax.up.railway.app` (actual deployed URL)
- 3 metric docs (self-correction-rate, context-efficiency, error-recovery-efficiency): added "Current implementation" sections with actual formulas, moved aspirational algorithms to "Future refinement" sections

**Polish:**
- Added emojis and visual warmth throughout README, setup guide, and metrics index
- Made setup guide feel like a friendly 5-minute walkthrough with numbered emoji steps
- Improved setup guide structure: checklist prerequisites, callout boxes for important notes, table-based dashboard overview

---

## 2026-04-14 — Agent behavior metrics pipeline

**Pages updated:** metrics, data-model, go-cli

- CLI now sends `bash_errors`, `bash_successes`, `files_read_count`, `files_modified_count` per session
- Sessions table has 4 new columns for agent behavior data
- MetricsComputer computes `self_correction_rate`, `context_efficiency`, `error_recovery_attempts` from correlated sessions at PR finalization
- These 3 metrics are no longer always null in the dashboard

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
