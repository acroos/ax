# Dashboard

The Next.js dashboard displays metrics, trends, and developer comparisons. It fetches all data from the Rails API (managed mode only).

Location: `dashboard/`

## Routes

### Core Routes

| Route | Page | What it shows |
|-------|------|---------------|
| `/` | Root | Redirects to default org or login |
| `/login` | Login | GitHub OAuth sign-in |
| `/onboarding` | Onboarding | Multi-step guided setup: welcome, API key reveal, CLI install, done |
| `/prs/[id]` | PR Detail | All metrics for one PR, grouped by category |
| `/docs` | Docs Index | Grid of all metric documentation pages |
| `/docs/[slug]` | Metric Doc | Individual metric explanation (rendered from `docs/metrics/*.md`) |
| `/settings` | Account | Profile (GitHub identity), API key rotation, logout |

### Org-Scoped Routes

| Route | Page | What it shows |
|-------|------|---------------|
| `/{slug}` | Org Overview | Aggregate metrics across all PRs, grouped by category |
| `/{slug}/prs` | PR List | Org-scoped table of finalized PRs with inline metrics |
| `/{slug}/compare` | Compare | Org-scoped developer leaderboard, individual vs team averages, time filtering |
| `/{slug}/settings` | Org Settings | GitHub App installation card (status, connected repos, install/reinstall), members list (role management, removal), and invites (create, list, revoke) |

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
| `getDeveloperComparisonAsync(opts)` | Per-developer metric aggregates |
| `getFilteredMetricsAsync(opts)` | Metrics filtered by time range and/or author |
| `listReposAsync(orgSlug?)` | Tracked repositories |
| `listDevelopersAsync(repoId?, orgSlug?)` | Unique PR author logins |
| `getGithubInstallation(orgSlug)` | Installation state + user role + connected repos |
| `requestGithubInstallUrl(orgSlug)` | Signed GitHub App install URL |

### API Communication

All fetches include the session token:
```typescript
headers["X-Ax-Session"] = cookieStore.get("_ax_session")?.value
```

Data endpoints are org-scoped: `/api/v1/orgs/{slug}/repos/{id}/prs`

GET fetches use `next: { revalidate: 60 }` by default (60s stale-while-revalidate). Mutations (`POST`/`PUT`/`DELETE`) use `cache: "no-store"`. Pass `revalidate: false` to `fetchAPI` to bypass caching for a specific GET.

## Components

### Charts
- **TrendChart** (`src/components/trend-chart.tsx`) — Recharts AreaChart with gradient fill, tooltips, and customizable units (e.g., "$" for cost metrics)
- **Sparkline** (same file) — Tiny inline chart (80x24px) used in metric cards on the overview page

### Filtering
- **TimeWindowPicker** (`src/components/time-window-picker.tsx`) — Date range selector with presets (7d, 30d, 90d, All). Updates URL query params (`since`, `until`).
- **DeveloperSelector** (`src/components/developer-selector.tsx`) — Dropdown to filter by PR author. Updates `author` query param.

### Navigation
- **OrgSwitcher** (`src/components/org-switcher.tsx`) — Dropdown listing user's organizations with "Personal" badge. Visible in sidebar.

### Content
- **Markdown** (`src/components/markdown.tsx`) — Renders metric docs from `docs/metrics/*.md` using `react-markdown` + `remark-gfm`. Custom styled components for headings, tables, code blocks.

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
| `src/app/[slug]/compare/page.tsx` | Org-scoped developer comparison |
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
