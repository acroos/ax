# Dashboard

The Next.js dashboard displays metrics and trends for org-scoped pull requests. It fetches all data from the Rails API (managed mode only).

Location: `dashboard/`

## Routes

### Core Routes

| Route | Page | What it shows |
|-------|------|---------------|
| `/` | Root | Redirects to default org or login |
| `/login` | Login | GitHub OAuth sign-in |
| `/onboarding` | Onboarding | Multi-step guided setup: welcome, API key reveal, CLI install, done |
| `/prs/[id]` | PR Detail | All metrics for one PR, grouped by category |
| `/docs` | Docs Index | Grid of all metric documentation pages, plus link to data collection disclosure |
| `/docs/data-collection` | Data Collection | What data AX collects, sends, and stores (rendered from `docs/data-collection.md`) |
| `/docs/[slug]` | Metric Doc | Individual metric explanation (rendered from `docs/metrics/*.md`) |
| `/settings` | Account | Profile (GitHub identity), API key rotation, logout |

### Org-Scoped Routes

| Route | Page | What it shows |
|-------|------|---------------|
| `/{slug}` | Org Overview | Aggregate metrics across all PRs, grouped by category. Clickable metric cards link to drill-down pages. Shows selected repo name. |
| `/{slug}/metrics/[metric]` | Metric Detail | Per-PR breakdown for a single metric: bar chart, summary stats, sortable table, and documentation |
| `/{slug}/prs` | PR List | Org-scoped table of finalized PRs with inline metrics and session count column |
| `/{slug}/settings` | Org Settings | GitHub App installation card (status, connected repos, install/reinstall), members list (role management, removal), and invites (create, list, revoke) |
| `/{slug}/billing` | Billing | Current plan badge, seat count and monthly total (Pro), usage bars (members vs purchased seats, repos vs limits), upgrade/manage buttons, feature comparison for free plan |

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
| `listPRsWithMetricsAsync(repoId?, orgSlug?)` | Finalized PRs with all computed metrics |
| `getPRWithMetricsAsync(id)` | Single PR with metrics (hits `/api/v1/prs/:id`) |
| `computeAggregatesFromPRs(prs)` | Compute aggregate metrics from a PR array (no API call) |
| `getAggregateMetricsAsync(repoId?, orgSlug?)` | Averages and sums across all metrics |
| `getTimelineAsync(repoId?, orgSlug?)` | Time-series data for trend charts |
| `listReposAsync(orgSlug?)` | Tracked repositories |
| `getGithubInstallation(orgSlug)` | Installation state + user role + connected repos |
| `requestGithubInstallUrl(orgSlug)` | Signed GitHub App install URL |
| `getBilling(orgSlug)` | Plan details, subscription status, usage counts |

### API Communication

All fetches include the session token:
```typescript
headers["X-Ax-Session"] = cookieStore.get("_ax_session")?.value
```

Data endpoints are org-scoped: `/api/v1/orgs/{slug}/repos/{id}/prs`

GET fetches use `next: { revalidate: 60 }` by default (60s stale-while-revalidate). Mutations (`POST`/`PUT`/`DELETE`) use `cache: "no-store"`. Pass `revalidate: false` to `fetchAPI` to bypass caching for a specific GET.

## Components

### Navigation
- **OrgSwitcher** (`src/components/org-switcher.tsx`) — Dropdown listing user's organizations with "Personal" badge. Visible in sidebar.

### Content
- **Markdown** (`src/components/markdown.tsx`) — Renders metric docs from `docs/metrics/*.md` using `react-markdown` + `remark-gfm`. Custom styled components for headings, tables, code blocks.

### Loading states
- **Skeleton primitives** (`src/components/skeleton.tsx`) — `Skeleton`, `SkeletonMetricCard`, `SkeletonMetricCategory`, `SkeletonTableRow`, `SkeletonTableBody`, `SkeletonPageHeader`, `SkeletonChartPanel`. Shared building blocks for route-level loading UIs and in-page Suspense fallbacks.
- **Route-level `loading.tsx`** — Every page under `/(app)` has a sibling `loading.tsx` that Next.js renders instantly on navigation (before the page's async data awaits resolve). Each skeleton mirrors the real page's layout. Files: `[slug]/loading.tsx`, `[slug]/prs/loading.tsx`, `[slug]/metrics/[metric]/loading.tsx`, `[slug]/settings/loading.tsx`, `[slug]/billing/loading.tsx`, `prs/[id]/loading.tsx`, `settings/loading.tsx`.
- **Navigation progress bar** — `nextjs-toploader` is mounted in `src/app/layout.tsx` (2px, indigo `#6366F1`, no spinner). Shows at the top of the viewport during any `<Link>` navigation to give continuous "something is happening" feedback.
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
| `/[slug]` | h1 + "View all PRs" link | Subtitle (repo + count), metrics body (4 category grids, `NoDataState` / `NoFinalizedPRsState` fallbacks) |
| `/[slug]/prs` | h1 + table header | Subtitle count, `<tbody>` rows, `NoDataBody` fallback |
| `/[slug]/metrics/[metric]` | Back link + header + doc content (read from disk synchronously) | Data count subtitle, 5 summary stat cards, chart panel, PR table |
| `/prs/[id]` | Back link | PR header (title + badges + metadata), grouped metric cards, `PRNotFound` fallback |
| `/[slug]/settings` | h1 | GitHub App card, Members card, Invites card (each independent Suspense) |
| `/[slug]/billing` | h1 + banner | Billing card |

**Gotchas:**
- `redirect()` must be called above any Suspense boundary — calling it from inside an async child raises a render-time error instead of navigating.
- Shared promises should have `.catch(() => fallbackValue)` attached at creation time if both a subtitle and a body consume them and you only want the error boundary to trigger on the body.
- Error boundaries must nest the Suspense (`<SectionErrorBoundary><Suspense>…</Suspense></SectionErrorBoundary>`) — otherwise the boundary never sees the throw.

## Styling

Dark mode only. Tailwind CSS v4 with a custom theme.

### Design Tokens (from `src/app/globals.css`)

| Token | Value | Usage |
|-------|-------|-------|
| `--color-void` | `#08080D` | Page background |
| `--color-surface-0` to `-3` | Progressive grays | Card/panel elevation |
| `--color-border` | `#252536` | Default borders |
| `--color-text-primary` | `#E8E8ED` | Main text |
| `--color-text-secondary` | `#8B8B9E` | Reduced contrast text |
| `--color-accent` | `#6366F1` | Primary CTA (indigo) |

Fonts: Geist (sans) and Geist Mono. Typography: 13-14px body, 11-12px labels, 20-22px headings.

### Custom Effects
- `.metric-card` — Hover glow on metric cards
- `.animate-in` — Staggered fade-up entrance animations
- `.tooltip-trigger` / `.tooltip-content` — Hover tooltips

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
- `src/middleware.ts` — Auth enforcement (redirects unauthenticated users to `/login`)

The middleware enforces auth on all routes. Public paths are excluded: `/login`, `/invite`, `/auth`, `/docs`, `/_next`.

## Configuration

| Env Var | Purpose | Default |
|---------|---------|---------|
| `AX_API_URL` | Rails API endpoint | `http://localhost:3000` |
| `AX_API_KEY` | Optional Bearer token for API requests | unset |
| `NEXT_STANDALONE` | Enable standalone Docker output | unset |

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/db.ts` | API data layer |
| `src/lib/auth.ts` | Auth helpers |
| `src/app/layout.tsx` | Root layout with sidebar |
| `src/app/page.tsx` | Root page (redirects to org or login) |
| `src/app/[slug]/prs/page.tsx` | Org-scoped PR list |
| `src/app/prs/[id]/page.tsx` | PR detail |
| `src/app/globals.css` | Theme, tokens, animations |
| `src/app/api/v1/[...path]/route.ts` | API proxy for client components |
| `src/app/settings/api-key-section.tsx` | API key reveal + rotate client component |
| `src/app/settings/logout-button.tsx` | Logout button client component |
| `src/app/auth/logout/route.ts` | Logout route handler (destroys session, clears cookie) |
| `src/app/onboarding/onboarding-steps.tsx` | Multi-step onboarding client component |
| `src/app/[slug]/settings/github-app-card.tsx` | GitHub App installation card (3-state: missing/active/suspended, connected repos list, syncing indicator, reinstall flow) |
| `src/app/[slug]/settings/members-section.tsx` | Member management client component |
| `src/app/[slug]/settings/invites-section.tsx` | Invite management client component |
| `src/middleware.ts` | Auth enforcement |
| `next.config.ts` | Build config |
