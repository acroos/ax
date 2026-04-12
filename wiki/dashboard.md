# Dashboard

The Next.js dashboard displays metrics, trends, and developer comparisons. It operates in two modes: local (reading SQLite directly) and managed (fetching from the Rails API).

Location: `dashboard/`

## Routes

### Local Mode

| Route | Page | What it shows |
|-------|------|---------------|
| `/` | Overview | Aggregate metric cards with sparklines, trend charts, recent PR table |
| `/prs` | PR List | Table of finalized PRs with inline metrics |
| `/prs/[id]` | PR Detail | All metrics for one PR, grouped by category |
| `/compare` | Compare | Developer leaderboard, individual vs team averages, time filtering |
| `/docs` | Docs Index | Grid of all metric documentation pages |
| `/docs/[slug]` | Metric Doc | Individual metric explanation (rendered from `docs/metrics/*.md`) |

### Managed Mode (Org-Scoped)

| Route | Page | What it shows |
|-------|------|---------------|
| `/login` | Login | GitHub OAuth sign-in |
| `/onboarding` | Onboarding | First-time setup with API key display |
| `/{slug}/prs` | PR List | Org-scoped PR list |
| `/{slug}/compare` | Compare | Org-scoped developer comparison |
| `/{slug}/settings` | Org Settings | Members and invite management |
| `/settings` | User Settings | API key view and rotation |

### Auth Routes

| Route | Purpose |
|-------|---------|
| `/auth/accept` | Cross-origin session handoff from Rails OAuth callback |
| `/invite/[token]` | Invite acceptance flow |

## Dual-Mode Data Layer

The data layer (`src/lib/db.ts`) detects the operating mode via `AX_API_URL` and provides two function variants:

- **Sync functions** (e.g., `listRepos()`) — Read SQLite directly. Used in server components in local mode.
- **Async functions** (e.g., `listReposAsync(orgSlug?)`) — Work in both modes. In local mode, call the sync variant. In managed mode, fetch from the Rails API with session token.

### Key Data Functions

| Function | Returns |
|----------|---------|
| `listPRsWithMetrics()` | Finalized PRs with all computed metrics |
| `getAggregateMetrics()` | Averages and sums across all metrics |
| `getTimeline()` | Time-series data for trend charts |
| `getDeveloperComparison()` | Per-developer metric aggregates |
| `getFilteredMetrics()` | Metrics filtered by time range and/or author |

### Mode Detection

```typescript
// Managed mode if AX_API_URL is set
const isAPIMode = () => !!process.env.AX_API_URL

// Local mode reads from this path
const dbPath = process.env.AX_DB_PATH || path.join(os.homedir(), '.ax', 'ax.db')
```

### API Communication (Managed Mode)

All fetches include the session token:
```typescript
headers["X-Ax-Session"] = cookieStore.get("_ax_session")?.value
```

Data endpoints are org-scoped: `/api/v1/orgs/{slug}/repos/{id}/prs`

All fetches use `cache: "no-store"` for fresh data.

## Components

### Charts
- **TrendChart** (`src/components/trend-chart.tsx`) — Recharts AreaChart with gradient fill, tooltips, and customizable units (e.g., "$" for cost metrics)
- **Sparkline** (same file) — Tiny inline chart (80x24px) used in metric cards on the overview page

### Filtering
- **TimeWindowPicker** (`src/components/time-window-picker.tsx`) — Date range selector with presets (7d, 30d, 90d, All). Updates URL query params (`since`, `until`).
- **DeveloperSelector** (`src/components/developer-selector.tsx`) — Dropdown to filter by PR author. Updates `author` query param.

### Navigation
- **OrgSwitcher** (`src/components/org-switcher.tsx`) — Dropdown listing user's organizations with "Personal" badge. Visible in sidebar in managed mode.

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

## Authentication (Managed Mode)

See [Authentication](authentication.md) for the full flow.

Key files:
- `src/lib/auth.ts` — `getCurrentUser()`, mode detection
- `src/app/auth/accept/route.ts` — Cross-origin cookie handoff
- `src/middleware.ts` — Auth enforcement (redirects unauthenticated users to `/login`)

The middleware only enforces auth when `AX_API_URL` is set. Public paths are excluded: `/login`, `/invite`, `/auth`, `/docs`, `/_next`.

## Configuration

| Env Var | Purpose | Default |
|---------|---------|---------|
| `AX_API_URL` | Rails API endpoint (enables managed mode) | unset (local mode) |
| `AX_DB_PATH` | SQLite database path | `~/.ax/ax.db` |
| `NEXT_STANDALONE` | Enable standalone Docker output | unset |

`next.config.ts` marks `better-sqlite3` as a server external package to allow SQLite in server components.

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/db.ts` | Dual-mode data layer (~1600 lines) |
| `src/lib/auth.ts` | Auth helpers and mode detection |
| `src/app/layout.tsx` | Root layout with sidebar |
| `src/app/page.tsx` | Overview page |
| `src/app/prs/page.tsx` | PR list |
| `src/app/prs/[id]/page.tsx` | PR detail |
| `src/app/compare/page.tsx` | Developer comparison |
| `src/app/globals.css` | Theme, tokens, animations |
| `src/middleware.ts` | Auth enforcement |
| `next.config.ts` | Build config |
