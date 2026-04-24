# Dashboard

The Next.js dashboard displays metrics and trends for org-scoped pull requests. It fetches all data from the Rails API (managed mode only).

Location: `dashboard/`

## Routes

### Core Routes

| Route | Page | What it shows |
|-------|------|---------------|
| `/` | Root | Redirects to default org or login |
| `/login` | Login | GitHub OAuth sign-in |
| `/onboarding` | Onboarding | Two-path guided setup. **Admin path** (5 steps): welcome, GitHub App install, API key + CLI, invite team, all-set landing. **Member path** (3 steps, `?role=member&org=<slug>`): welcome, API key + CLI, all-set landing. Rendered in its own `(onboarding)` route group without the sidebar. |
| `/prs/[id]` | PR Detail | All metrics for one PR, grouped by category |
| `/docs` | Docs Index | Grid of all metric documentation pages, plus link to data collection disclosure |
| `/docs/data-collection` | Data Collection | What data AX collects, sends, and stores (rendered from `docs/data-collection.md`) |
| `/docs/[slug]` | Metric Doc | Individual metric explanation (rendered from `docs/metrics/*.md`) |
| `/contact` | Contact | Email and GitHub links for reaching out |
| `/settings` | Account | Profile (GitHub identity), API key rotation, logout |

### Org-Scoped Routes

| Route | Page | What it shows |
|-------|------|---------------|
| `/{slug}` | Org Overview | Aggregate metrics grouped by category with section dividers (AX motif). Cards use a "stacked narrative" layout: serif metric value, delta pill, hero sparkline (h-16), then detail text. A 7d/30d/90d range toggle (`?range=` query param, always present) controls the comparison window, sparkline date range, and delta period. Clickable cards link to drill-down pages, preserving both `range` and `repo` query params. |
| `/{slug}/metrics/[metric]` | Metric Detail | Per-PR breakdown for a single metric: bar chart, summary stats, sortable table, and documentation |
| `/{slug}/prs` | PR List | Org-scoped table of finalized PRs with inline metrics and session count column |
| `/{slug}/settings` | Org Settings | GitHub App installation card (status, connected repos, install/reinstall), members list (role management, removal), and invites (create, list, revoke) |
| `/{slug}/billing` | Billing | Current plan badge, seat count and monthly total (Pro), usage bars (members vs purchased seats, repos vs limits), upgrade/manage buttons, feature comparison for free plan |
| `/{slug}/me` | My Dashboard | Aggregate metrics for PRs authored by the current user (mirrors org overview, scoped to current user) |
| `/{slug}/me/prs` | My PR List | PRs authored by the current user |
| `/{slug}/me/metrics/{metric}` | My Metric Detail | Per-PR breakdown for a metric, scoped to current user's PRs |
| `/{slug}/teams` | Teams Index | List of teams in the org (Pro only) |
| `/{slug}/teams/{team}` | Team Overview | Aggregate metrics for a team (mirrors org overview, scoped to team members) |
| `/{slug}/teams/{team}/prs` | Team PR List | PRs authored by team members |
| `/{slug}/teams/{team}/metrics/{metric}` | Team Metric Detail | Per-PR breakdown for a metric, scoped to team |
| `/{slug}/settings/teams/{team}` | Team Edit | Edit team name, manage team members (admin only) |

### Auth Routes

| Route | Purpose |
|-------|---------|
| `/auth/accept` | Cross-origin session handoff from Rails OAuth callback |
| `/auth/logout` | Destroy session (Rails + cookie) and redirect to login |
| `/invite/[token]` | Invite acceptance flow |

## Data Layer

The data layer (`src/lib/db.ts`) fetches all data from the Rails API. All data functions are async.

### Key Data Functions

| Function | Returns |
|----------|---------|
| `listPRsWithMetricsAsync(repoId?, orgSlug?, pagination?)` | Paginated PRs with metrics. Returns `PaginatedPRs` (`{ data, pagination: { next_cursor, has_more, total } }`). Pass `{ cursor, per_page }` for subsequent pages. |
| `getPRWithMetricsAsync(id)` | Single PR with metrics (hits `/api/v1/prs/:id`) |
| `computeAggregatesFromPRs(prs)` | Compute aggregate metrics from a PR array (no API call). Only computes PR-derived metrics (post-open-commits, ci-success-rate, line-revisit-rate). Returns `{ totalPRs, totalSessions, sessionDataCount, metrics: { [slug]: { current, prior: null, sparkline: [] } } }` — prior/sparkline are only populated by the server. |
| `getAggregateMetricsAsync(repoId?, orgSlug?, range?)` | Windowed aggregate metrics. `range` is `"7d"`, `"30d"` (default), or `"90d"` — controls both the current/prior comparison windows and the sparkline date range. Returns `{ totalPRs, sessionDataCount, metrics: { [slug]: { current, prior, sparkline: [{t, v}] } } }`. |
| `getTimelineAsync(repoId?, orgSlug?)` | Time-series data for trend charts |
| `listReposAsync(orgSlug?)` | Tracked repositories |
| `getGithubInstallation(orgSlug)` | Installation state + user role + connected repos |
| `requestGithubInstallUrl(orgSlug)` | Signed GitHub App install URL |
| `getBilling(orgSlug)` | Plan details, subscription status, usage counts |
| `listTeams(orgSlug)` | Teams in the org |
| `getTeam(orgSlug, teamSlug)` | Team detail |
| `listTeamPRsAsync(orgSlug, teamSlug, pagination?)` | Paginated PRs authored by team members. Same `PaginatedPRs` return type. |
| `getTeamMetrics(orgSlug, teamSlug, range?)` | Windowed aggregate metrics for a team |
| `getTeamMembers(orgSlug, teamSlug)` | Team members list |
| `listMyPRsAsync(orgSlug, pagination?)` | Paginated PRs authored by the current user. Same `PaginatedPRs` return type. |
| `getMyMetricsAsync(orgSlug, range?)` | Windowed aggregate metrics for the current user's PRs |
| `listSessionsAsync(repoId?, orgSlug?, pagination?)` | Paginated sessions with per-session metrics. Hits `/orgs/:slug/sessions` or `/orgs/:slug/repos/:id/sessions`. Returns `PaginatedSessions`. |
| `listMySessionsAsync(orgSlug, pagination?)` | Sessions pushed by the current user. Hits `/orgs/:slug/me/sessions`. |
| `listTeamSessionsAsync(orgSlug, teamSlug, pagination?)` | Sessions pushed by team members. Hits `/orgs/:slug/teams/:team_slug/sessions`. |
| `getMetricDetailAsync(orgSlug, metricSlug, range?, repoId?)` | Server-computed metric detail for a single metric. Returns `MetricDetailResponse` with stats (avg/P10/P50/P90), prior-period stats, daily trend, distribution histogram, and notable items. Used by metric detail pages. |
| `getMyMetricDetailAsync(orgSlug, metricSlug, range?)` | Same as above, scoped to current user's data. |
| `getTeamMetricDetailAsync(orgSlug, teamSlug, metricSlug, range?)` | Same as above, scoped to a team. |

### API Communication

All fetches include the session token:
```typescript
headers["X-Ax-Session"] = cookieStore.get("_ax_session")?.value
```

Data endpoints are org-scoped: `/api/v1/orgs/{slug}/repos/{id}/prs`

GET fetches use `next: { revalidate: 60 }` by default (60s stale-while-revalidate). Mutations (`POST`/`PUT`/`DELETE`) use `cache: "no-store"`. Pass `revalidate: false` to `fetchAPI` to bypass caching for a specific GET.

## Components

### Layout shells
- **App sidebar** (`src/app/(app)/layout.tsx`) — Composes shadcn `Sidebar` + `SidebarProvider` + `SidebarInset`. Server-rendered `AppSidebar` resolves the current org slug (from the middleware-injected `x-pathname` header), fetches the user, teams, and GitHub installation (for role) in parallel, and streams into the shell under a Suspense boundary that renders `SidebarMenuSkeleton`. Contains: logo wordmark, `OrgSwitcher`, nav menu (Overview, My Dashboard, Pull Requests), optional "Teams" group (Pro non-personal orgs only), and a footer with user avatar dropdown menu (Account Settings, Org Settings + Billing for admin/owner only, Docs), `ThemeToggle`, and Data & Privacy link. Repo filtering lives in page content areas via `RepoFilter`, not the sidebar. A `SidebarTrigger` in the inset's mobile header toggles the sheet on small screens.
- **Marketing shell** (`src/app/(marketing)/layout.tsx`) — Header composes shadcn `NavigationMenu` + `NavigationMenuLink` for the four marketing links (Docs / Plans / Setup / Changelog), plus outline "Sign in" and primary "Get Started" `Button`s. Footer uses shadcn `Separator` with the `ThemeToggle` sitting in the right-hand nav.

### Navigation
- **OrgSwitcher** (`src/components/org-switcher.tsx`) — Combobox built from shadcn `Popover` + `Command` (cmdk). Receives `orgs` and `currentSlug` from the sidebar; highlights the current org with a check, navigates via `next/navigation` on select, shows a "Personal" label next to personal orgs, and filters via the command input.
- **RepoFilter** (`src/components/repo-filter.tsx`) — Client component that renders an inline dropdown for repo scoping. Uses shadcn `DropdownMenu` with radio items. Reads/writes the `?repo=` URL query param via `next/navigation`. Renders as "All Repositories" (or the active repo name) with a chevron; opens a list of repos on click. Falls back to a static `<span>` when no repos exist. Used in page subtitles (overview, PRs, metric detail) instead of the former sidebar "Filter by Repo" section.

### Content
- **Markdown** (`src/components/markdown.tsx`) — Renders metric docs from `docs/metrics/*.md` using `react-markdown` + `remark-gfm`. Custom styled components for headings, tables, code blocks.
- **StateBadge** (`src/components/state-badge.tsx`) — Shared PR-state pill. Maps `merged → success` (olive), `open → info` (dusk), `closed → attention` (russet), `draft → muted`. Used by the PR list, PR detail header, and metric-detail PR table.
- **BooleanMetricSummary** (`src/components/boolean-metric-summary.tsx`) — Two-column PR split with proportion bar for boolean metrics (e.g. `has_tests`, `first_pass_accepted`). Honors a `trueIsBetter` orientation; the "healthy" side uses `success` (olive), the other side `muted`, per THEME.md's non-judgmental palette.
- **MetricBarChart** (`src/components/metric-bar-chart.tsx`) — Wraps shadcn's `chart` primitive over recharts. Takes a `colorSlot` (1..8) that resolves through `chartColor()` to `--color-chart-<n>`, so colors brighten automatically in dark mode. No hex values anywhere in the chart code.
- **SectionDivider** (`src/components/section-divider.tsx`) — Minimal section header on overview pages. Clay dot (`bg-primary`), sans-serif label in uppercase, and a single horizontal rule in `muted-foreground`. Threads the brand through the page without overusing clay.
- **Sparkline** (`src/components/sparkline.tsx`) — Hand-rolled SVG sparkline for inline trend visualization. Takes `SparklinePoint[]` data, breaks the line on null values (gaps), returns null when fewer than 2 data points. Optional `label` prop adds a screen-reader-accessible description with auto-computed trend direction (up/down/flat). No external charting dependency. Used in overview metric cards.

### Shared page components
These components are rendered by both `/(app)` and `/demo` routes with different data sources, eliminating duplication between the two route trees:
- **MetricCard** + formatters (`src/components/metric-card.tsx`) — Metric card with serif value, delta pill, sparkline, and hover tooltip overlay. Exports formatting utilities `fmt`, `fmtPct`, `fmtCost`, `fmtDelta`. Used by `OverviewMetricsGrid`.
- **OverviewMetricsGrid** (`src/components/overview-metrics-grid.tsx`) — Data-driven 3-category × 3-card grid (Delivery, Session Effectiveness, Adoption Maturity) used on overview and team detail pages. Loops over `CATEGORIES` and filters `DISPLAYED_METRICS` by category — no per-metric hardcoding. Uses `formatMetricValue()` from metric-defs.ts for value formatting. Accepts `metrics` (resolved `Record<string, MetricAggregate>`), `range`, and a `metricHref` builder function. App pages pass `/${slug}/metrics/${slug}`, demo pages pass `/demo/metrics/${slug}`.
- **PRTableHeader** (`src/components/pr-table-header.tsx`) — The 9-column table header with tooltip-wrapped column labels. Used by all 4 PR table pages (org PRs, team PRs, and their demo counterparts).
- **MetricDetailBody** + **BooleanPanel** (`src/components/metric-detail-content.tsx`) — Stats cards (count, avg, P10/P50/P90 with deltas), trend chart, distribution histogram, and notable items list. Accepts `values`, `allValues`, `def`, `range`, and an optional `prHref` function (app pages link to `/prs/${prId}`, demo pages render plain divs). Works with both `PRValue` and `SessionValue` types via the `MetricValue` union. `BooleanPanel` wraps `BooleanMetricSummary` for boolean metrics.

### Loading states
- **Skeleton primitives** (`src/components/skeleton.tsx`) — `Skeleton`, `SkeletonMetricCard`, `SkeletonMetricCategory`, `SkeletonTableRow`, `SkeletonTableBody`, `SkeletonPageHeader`, `SkeletonChartPanel`. Shared building blocks for route-level loading UIs and in-page Suspense fallbacks.
- **Route-level `loading.tsx`** — Every page under `/(app)` has a sibling `loading.tsx` that Next.js renders instantly on navigation (before the page's async data awaits resolve). Each skeleton mirrors the real page's layout. Files: `[slug]/loading.tsx`, `[slug]/prs/loading.tsx`, `[slug]/metrics/[metric]/loading.tsx`, `[slug]/settings/loading.tsx`, `[slug]/billing/loading.tsx`, `prs/[id]/loading.tsx`, `settings/loading.tsx`.
- **Navigation progress bar** — `nextjs-toploader` is dynamically imported via `src/components/top-loader.tsx` (client component, `ssr: false`). Deferred from the critical render path to improve FCP — it only activates on subsequent navigations, not the first page load. Configured at 2px height with `var(--color-primary)`, no spinner.
- **`SectionErrorBoundary`** (`src/components/section-error-boundary.tsx`) — Client-side class component that catches errors thrown from an async Suspense child and renders a fallback in place of that section only. Used to scope API failures to a single card/table instead of taking down the whole page.

### Streaming pattern (in-page Suspense)
Pages render their shell (headings, filter bars, table headers, static links) synchronously and stream data-dependent sections through `<Suspense>` boundaries. The shared recipe:

1. Page-level `await` only covers cheap bindings (`params`, `searchParams`, auth redirects).
2. Data-fetch promises are created without awaiting — e.g. `const prsPromise = listPRsWithMetricsAsync(...)`.
3. Each promise is passed as a prop to one or more async child components. Multiple children awaiting the same promise share a single fetch (React dedupes).
4. Each child is wrapped in `<Suspense fallback={<Skeleton…/>}>` and, where API failure should degrade gracefully, in `<SectionErrorBoundary fallback={<EmptyState/>}>` as well.

Page-by-page streaming topology:

| Page | Shell (synchronous) | Streamed islands |
|------|---------------------|------------------|
| `/[slug]` | h1 + "View all PRs" link | Subtitle (repo + count), metrics body (3 category grids — Delivery 3 cards, Session Effectiveness 3 cards, Adoption Maturity 3 cards, `NoDataState` / `NoFinalizedPRsState` fallbacks) |
| `/[slug]/prs` | h1 + table header | Subtitle count, `<tbody>` rows, `NoDataBody` fallback |
| `/[slug]/metrics/[metric]` | Back link + header + doc content (read from disk synchronously) | Data count subtitle ("X PRs with data" or "X sessions with data" depending on metric source), 5 summary stat cards, chart panel, notable items list. All data comes from the server-computed `metric_detail` endpoint (not paginated raw data). |
| `/prs/[id]` | Back link | PR header (title + badges + metadata), grouped metric cards, `PRNotFound` fallback |
| `/[slug]/me` | h1 + "View all my PRs" link | Subtitle (PR count), metrics body (3 category grids — mirrors org overview scoped to current user) |
| `/[slug]/me/prs` | Back link + h1 + table header | PR count, `<tbody>` rows |
| `/[slug]/me/metrics/[metric]` | Back link + header + doc content | Data count subtitle, 5 summary stat cards, chart panel, notable items list |
| `/[slug]/teams` | h1 | Teams list |
| `/[slug]/teams/[team]` | h1 + team name | Team metrics body (mirrors org overview) |
| `/[slug]/teams/[team]/prs` | h1 | Team PR table |
| `/[slug]/settings` | h1 | GitHub App card, Members card, Invites card, Teams card (each independent Suspense) |
| `/[slug]/billing` | h1 + banner | Billing card |

**Gotchas:**
- `redirect()` must be called above any Suspense boundary — calling it from inside an async child raises a render-time error instead of navigating.
- Shared promises should have `.catch(() => fallbackValue)` attached at creation time if both a subtitle and a body consume them and you only want the error boundary to trigger on the body.
- Error boundaries must nest the Suspense (`<SectionErrorBoundary><Suspense>…</Suspense></SectionErrorBoundary>`) — otherwise the boundary never sees the throw.

## Styling

Tailwind CSS v4 with the **Parchment & Clay** theme. Light mode is the default; dark mode is user-toggleable via `next-themes`. The canonical usage guide is [`dashboard/THEME.md`](../dashboard/THEME.md) — read it before styling anything.

### Where tokens live

- **`dashboard/src/app/globals.css`** — source of truth. Contains the `@theme` block (raw palette + semantic aliases) and the `.dark` override block. Semantic tokens follow shadcn/ui conventions so primitives drop in without remapping.
- **`dashboard/THEME.md`** — human-readable rules: when to reach for `primary` vs `accent` vs `success`, chart slot ordering, contrast ratios, dos and don'ts.

### Semantic tokens (99% of components)

Prefer these Tailwind utilities over raw palette names:

- Surfaces: `bg-background`, `bg-card`, `bg-popover`, `bg-muted`, `bg-secondary`
- Brand: `bg-primary` / `text-primary-foreground`, `bg-accent` / `text-accent-foreground`, `ring-ring`
- Status: `bg-success`, `bg-notice`, `bg-info`, `bg-attention`, `bg-destructive` (each with `-foreground` soft background sibling)
- Charts: `bg-chart-1` through `bg-chart-8`
- Sidebar: `bg-sidebar`, `bg-sidebar-primary`, `border-sidebar-border`
- Text/border: `text-foreground`, `text-muted-foreground`, `border-border`

Never write `dark:` variants for colors that already have semantic tokens — the token values remap automatically under `.dark`.

### Theme toggle

`src/components/theme-toggle.tsx` renders the Light / Dark / System dropdown. It's wired up at the root via `ThemeProvider` (`src/components/theme-provider.tsx`, wrapping `next-themes`). First-visit preference honors the user's OS setting when System is selected.

### Brand assets

Logo components `<Mark>`, `<Wordmark>`, `<Logo>` live at `src/components/logo/` (re-exported from `index.ts`). They use `currentColor` for ink and `var(--ax-clay)` (aliased to `--color-primary`) for the accent dot, so they theme automatically. Use `<Wordmark>` in headers, `<Mark>` in tight placements (favicons, avatars), `<Logo variant="…">` as a convenience wrapper.

The authoritative SVG vector sources and the brand contract (color, clear space, min sizes, don'ts) live at `dashboard/brand-assets/` — see [`brand-assets/README.md`](../dashboard/brand-assets/README.md). Installed PNG rasters / favicons / OG images are rendered from those SVGs; regenerate from `brand-assets/svg/` if the logo geometry ever changes. Next.js app-router metadata files (`icon.svg`, `apple-icon.png`, `opengraph-image.png`, `twitter-image.png`, `favicon.ico`, `manifest.webmanifest`) sit at `src/app/` and are auto-picked-up by Next.js's file-convention metadata API. PWA icons referenced by absolute URL in the manifest live at `public/ax-icon-*.png`. Theme color for the browser chrome is declared in `src/app/layout.tsx` via the `viewport` export.

### Primitive components

Primitive UI comes from [shadcn/ui](https://ui.shadcn.com/) under `src/components/ui/`. Currently installed: `alert`, `avatar`, `badge`, `button`, `card`, `chart`, `command`, `dialog`, `dropdown-menu`, `input`, `label`, `navigation-menu`, `popover`, `progress`, `select`, `separator`, `sheet`, `sidebar`, `skeleton`, `table`, `tooltip`. Install new primitives with `npx shadcn@latest add <name>` from `dashboard/`. See the Components section above for the app-level compositions.

### Typography

- `font-sans` (default body): system-first stack with Inter fallback. No webfont loaded.
- `font-serif`: reserved for page titles, pull quotes, and editorial moments (Iowan Old Style / Charter / Source Serif 4 fallbacks). Don't apply to body UI.
- `font-mono`: JetBrains Mono / IBM Plex Mono fallbacks for code.

## Docs Rendering

Metric documentation lives in `docs/metrics/*.md` and is rendered at `/docs` and `/docs/[slug]`.

- `generateStaticParams()` pre-builds all doc pages at build time
- Filenames map to slugs: `post-open-commits.md` → `/docs/post-open-commits`
- The docs index reads all `.md` files, extracts the h1 title, and displays a clickable grid

## API Proxy

Client-side `fetch("/api/v1/...")` calls are proxied through a Next.js catch-all route handler at `src/app/api/v1/[...path]/route.ts`. This route:
- Reads the `_ax_session` cookie
- Forwards the request to `${AX_API_URL}/api/v1/${path}` with the session token as `X-Ax-Session` header
- Returns the Rails response transparently

This avoids CORS issues and keeps the API URL server-side only.

## Authentication

See [Authentication](authentication.md) for the full flow.

Key files:
- `src/lib/auth.ts` — `getCurrentUser()`
- `src/app/auth/accept/route.ts` — Cross-origin cookie handoff
- `src/app/api/v1/[...path]/route.ts` — API proxy for client components
- `src/proxy.ts` — Edge proxy (Next.js 16 convention). Auth enforcement (redirects unauthenticated users to `/login`), `x-pathname` header injection, and `_ax_last_org` cookie for fast landing page redirects.

The proxy enforces auth on all routes. Public paths are excluded: `/login`, `/invite`, `/auth`, `/docs`, `/_next`. Authenticated users visiting `/` with a `_ax_last_org` cookie get an edge redirect (no serverless function hit).

## Performance

### Edge Runtime

Most app pages use `export const runtime = "edge"` for near-zero cold starts (~5ms vs ~500ms for Node.js serverless). This dramatically improves TTFB, especially under low traffic.

**Edge-compatible pages:** All `(app)` pages except the 3 metric detail pages (`[slug]/metrics/[metric]`, `[slug]/me/metrics/[metric]`, `[slug]/teams/[team]/metrics/[metric]`) which use `fs` to read markdown docs from disk.

**When adding new pages:** Default to `export const runtime = "edge"` unless the page imports `fs`, `path`, or other Node.js-only APIs.

### Vercel Region

Serverless functions (the metric detail pages that can't use Edge) are pinned to `sfo1` via `vercel.json` `"regions"` to colocate with the Railway API server in us-west.

### Fetch Caching

API fetches default to `revalidate: 60` (60s stale-while-revalidate). Notable exceptions:
- `getGithubInstallation()` — cached at 60s by default; the settings page bypasses the cache (`revalidate: false`) when returning from GitHub App installation (`?installed=true`).
- Mutations (`POST`/`PUT`/`DELETE`) — always `cache: "no-store"`.
- `getBilling()` — always `revalidate: false` (fresh data).

## Configuration

| Env Var | Purpose | Default |
|---------|---------|---------|
| `AX_API_URL` | Rails API endpoint | `http://localhost:3000` |
| `AX_API_KEY` | Optional Bearer token for API requests | unset |
| `NEXT_STANDALONE` | Enable standalone Docker output | unset |

## Testing

Tests use [Vitest](https://vitest.dev/) (`vitest.config.ts` in `dashboard/`). Run with `npm test`.

### Test files

| File | What it covers |
|------|----------------|
| `src/lib/__tests__/db.test.ts` | `computeAggregatesFromPRs`, `getPRSize`, `orgApiPath` |
| `src/lib/__tests__/metric-defs.test.ts` | `formatMetricValue`, `getMetricDef` |
| `src/lib/__tests__/metric-utils.test.ts` | `percentile`, `extractPRValues`, `extractSessionValues`, `filterByRange`, `filterSessionsByRange`, `aggregateByDay`, `computeDistribution` |

### Shared metric utilities

Pure functions used by both the app and demo metric detail pages are extracted into `src/lib/metric-utils.ts`: `percentile`, `extractPRValues`, `extractSessionValues`, `filterByRange`, `filterSessionsByRange`, `aggregateByDay`, `computeDistribution`, and related types (`PRValue`, `SessionValue`, `MetricValue`, `DistBucket`). The `MetricValue` union type (`PRValue | SessionValue`) allows metric detail pages to handle both PR-sourced and session-sourced metrics through the same rendering pipeline. The `isPRValue()` type guard distinguishes between the two at render time. All metric detail pages import from this module: the org-scoped `[slug]/metrics/[metric]/page.tsx`, the personal `[slug]/me/metrics/[metric]/page.tsx`, the team `[slug]/teams/[team]/metrics/[metric]/page.tsx`, and their demo counterparts (`demo/metrics/[metric]`, `demo/me/metrics/[metric]`, `demo/teams/[team]/metrics/[metric]`).

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/db.ts` | API data layer |
| `src/lib/metric-defs.ts` | Metric definitions with `source`, `displayed`, `category` fields, `DISPLAYED_METRICS` / `CATEGORIES` exports, format helpers |
| `src/lib/metric-utils.ts` | Shared metric computation utilities (distribution bucketing, percentiles, filtering, PR and session value extraction) |
| `src/components/metric-card.tsx` | Shared MetricCard component + formatting utilities (fmt, fmtPct, fmtCost, fmtDelta) |
| `src/components/overview-metrics-grid.tsx` | Data-driven 3×3 metric category grid (Delivery, Session Effectiveness, Adoption Maturity) |
| `src/components/pr-table-header.tsx` | Shared 9-column PR table header with tooltip column labels |
| `src/components/metric-detail-content.tsx` | Shared metric detail body (stats, trend, distribution, notable PRs, boolean panel) |
| `src/lib/auth.ts` | Auth helpers |
| `src/app/layout.tsx` | Root layout with sidebar |
| `src/app/page.tsx` | Root page (redirects to org or login) |
| `src/app/[slug]/prs/page.tsx` | Org-scoped PR list |
| `src/app/prs/[id]/page.tsx` | PR detail |
| `src/app/globals.css` | Parchment & Clay theme — `@theme` block, semantic tokens, `.dark` overrides, base layer |
| `src/app/api/v1/[...path]/route.ts` | API proxy for client components |
| `src/app/settings/api-key-section.tsx` | API key reveal + rotate client component |
| `src/app/settings/logout-button.tsx` | Logout button client component |
| `src/app/auth/logout/route.ts` | Logout route handler (destroys session, clears cookie) |
| `src/app/(onboarding)/onboarding/page.tsx` | Onboarding server component (auth, role detection) |
| `src/app/(onboarding)/onboarding/onboarding-steps.tsx` | Multi-step onboarding client component (admin/member paths) |
| `src/app/(onboarding)/onboarding/actions.ts` | Server actions for GitHub App install URL and invite creation |
| `src/app/[slug]/settings/github-app-card.tsx` | GitHub App installation card (3-state: missing/active/suspended, connected repos list, syncing indicator, reinstall flow) |
| `src/app/[slug]/settings/members-section.tsx` | Member management client component |
| `src/app/[slug]/settings/teams-section.tsx` | Team create/delete management (admin, Pro only) |
| `src/app/[slug]/settings/teams/[team]/page.tsx` | Team edit page (name, members) |
| `src/app/[slug]/teams/` | Team overview, PR list, and metric detail pages |
| `src/app/[slug]/me/` | My Dashboard: overview, PR list, and metric detail pages (scoped to current user) |
| `src/app/[slug]/settings/invites-section.tsx` | Invite management client component |
| `src/proxy.ts` | Auth enforcement |
| `next.config.ts` | Build config |

## Analytics & Privacy

The dashboard loads `@vercel/analytics` and `@vercel/speed-insights` unconditionally in `layout.tsx`. Both are **cookie-free** and collect no personally identifiable information (PII). Under GDPR, no consent banner or opt-out mechanism is required. See [Vercel Analytics Privacy Policy](https://vercel.com/docs/analytics/privacy-policy) for details.
