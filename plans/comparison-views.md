## Comparison Views Implementation Plan

### Summary of Current State

The dashboard currently has three routes: overview (`/`), PR list (`/prs`), and PR detail (`/prs/[id]`). Data flows from SQLite through `dashboard/src/lib/db.ts`, which exposes `listPRsWithMetrics()`, `getAggregateMetrics()`, and `getTimeline()`. There is no concept of developer identity, time filtering, or multi-repo comparison anywhere in the dashboard. The DB schema has an `author` field on the `commits` table but no author/developer field on `prs`. The GitHub parser fetches PR author data (via `gh pr list`) but does not currently include the `author` field in its JSON query. Recharts is already installed.

### Key Architectural Gaps to Address

1. **No developer identity on PRs.** The `prs` table lacks an `author` column. Commits have `author` but this is the git committer name, not the GitHub login. The `gh pr list` command supports an `author` JSON field but it is not fetched today.

2. **No time filtering.** All queries fetch all finalized PRs. No `WHERE` clauses on date ranges exist.

3. **No percentile computation.** All aggregations are simple averages.

---

### Phase 1: Schema and Data Layer (Backend + Dashboard DB)

#### 1a. Add `author` to PRs (Go backend)

**File:** `/Users/austinroos/dev/ax/internal/db/db.go`
- Add migration version 4: `ALTER TABLE prs ADD COLUMN author TEXT;`

**File:** `/Users/austinroos/dev/ax/internal/db/models.go`
- Add `Author sql.NullString \`db:"author"\`` to the `PR` struct.

**File:** `/Users/austinroos/dev/ax/internal/db/queries.go`
- Update `UpsertPR` to include the `author` column in INSERT and ON CONFLICT UPDATE.

**File:** `/Users/austinroos/dev/ax/internal/parsers/github.go`
- Add `Author struct { Login string } \`json:"author"\`` to `GHPullRequest`.
- Add `author` to the `--json` field list in `ListPRs()` and `GetPR()`.

**File:** `/Users/austinroos/dev/ax/internal/sync/sync.go`
- Pass the parsed author login into the `PR` model before upserting.

#### 1b. Dashboard data layer additions

**File:** `/Users/austinroos/dev/ax/dashboard/src/lib/db.ts`

Add the following new interfaces and functions:

```typescript
// Add to PR interface
author: string | null;

// New function signatures
function listDevelopers(repoId?: number): string[]
function listPRsWithMetricsFiltered(opts: {
  repoId?: number;
  author?: string;
  since?: string;   // ISO date
  until?: string;   // ISO date
}): PRWithMetrics[]

function getAggregateMetricsFiltered(opts: {
  repoId?: number;
  author?: string;
  since?: string;
  until?: string;
}): AggregateMetrics

function getTimelineFiltered(opts: {
  repoId?: number;
  author?: string;
  since?: string;
  until?: string;
}): TimelinePoint[]

function getPercentileContext(
  metricName: string,
  value: number,
  repoId?: number,
  since?: string,
  until?: string,
): { percentile: number; teamAvg: number; teamMedian: number }

function getDeveloperComparison(
  repoId?: number,
  since?: string,
  until?: string,
): DeveloperMetrics[]

function getRepoComparison(
  since?: string,
  until?: string,
): RepoComparisonMetrics[]

function getMetricTrend(
  metricName: string,
  repoId?: number,
  author?: string,
  bucketDays: number,  // 7 or 30
): TrendBucket[]
```

New interfaces:

```typescript
interface DeveloperMetrics {
  author: string;
  prCount: number;
  metrics: AggregateMetrics;
}

interface RepoComparisonMetrics {
  repoId: number;
  repoName: string;
  prCount: number;
  metrics: AggregateMetrics;
}

interface TrendBucket {
  periodStart: string;
  periodEnd: string;
  value: number;
  prCount: number;
}
```

The filtered queries will use the existing `listPRsWithMetrics` pattern but add dynamic `WHERE` clauses for `p.author = ?`, `p.created_at >= ?`, and `p.created_at < ?`. Percentile computation will sort all metric values and find rank position.

---

### Phase 2: Shared UI Components

#### 2a. Time Window Picker

**New file:** `dashboard/src/components/time-window-picker.tsx`

A client component (`"use client"`) that updates URL search params. Presets: 7d, 30d, 90d, All, Custom. Custom shows two date inputs. The component renders as a row of pill-shaped buttons matching the existing `text-[12px] font-medium` style.

```
┌─────────────────────────────────────────────────┐
│  [7d]  [30d]  [90d]  [All]  [Custom ▾]         │
│                              ┌────────────────┐ │
│                              │ From: ____     │ │
│                              │ To:   ____     │ │
│                              └────────────────┘ │
└─────────────────────────────────────────────────┘
```

Implementation: uses `useRouter` and `useSearchParams` from `next/navigation`. Sets `since` and `until` query params. The server components read these from `searchParams`.

#### 2b. Developer Selector

**New file:** `dashboard/src/components/developer-selector.tsx`

Client component. A dropdown showing all known developers (fetched via a data prop passed from the server component). Supports "All" (team aggregate) and individual developer selection. Sets an `author` query param.

```
┌──────────────────────────────┐
│  Developer: [All ▾]         │
│             ┌──────────────┐ │
│             │ All (team)   │ │
│             │ alice        │ │
│             │ bob          │ │
│             │ carol        │ │
│             └──────────────┘ │
└──────────────────────────────┘
```

Styled to match the existing sidebar aesthetic: `bg-surface-2`, `text-text-secondary`, `border-border-subtle`.

#### 2c. Comparison Chart

**New file:** `dashboard/src/components/comparison-chart.tsx`

A bar chart component using Recharts `BarChart` for side-by-side comparisons (developer vs team, repo vs repo). Supports grouped bars with a legend.

```
  Token Cost / PR
  ┌─────────────────────────────────┐
  │  ██                             │
  │  ██  ▓▓                         │
  │  ██  ▓▓  ██                     │
  │  ██  ▓▓  ██  ▓▓                 │
  ├──┴───┴───┴───┴──────────────────┤
  │ alice    bob    team avg        │
  └─────────────────────────────────┘
  ██ Individual   ▓▓ Team Average
```

#### 2d. Percentile Badge

**New file:** `dashboard/src/components/percentile-badge.tsx`

Small inline badge that shows percentile rank: "P25", "P50", "P75", etc. Color-coded: green for good percentiles, amber for middle, red for concerning. Appears next to metric values on the overview and PR detail pages.

```
  Post-Open Commits
  ┌──────────────────────┐
  │  1.2  [P25 ✓]        │
  │  Avg commits after   │
  │  PR opened           │
  └──────────────────────┘
```

#### 2e. Trend Direction Indicator

**New file:** `dashboard/src/components/trend-indicator.tsx`

Shows an arrow (up/down/flat) with percentage change and a plain-language summary. Used on metric cards.

```
  ↓ 15% vs last 30d
```

Green for improvements, red for regressions. The component takes the current value and previous period value, plus a `lowerIsBetter` flag to determine color.

---

### Phase 3: New Pages

#### 3a. Comparison Page

**New file:** `dashboard/src/app/compare/page.tsx`

This is the primary new route. It shows side-by-side metrics with time window and developer filtering.

```
┌─ Sidebar ──┐┌─────────────────────────────────────────────────────┐
│ Overview   ││  Compare                                            │
│ Pull Reqs  ││  [7d] [30d] [90d] [All]   Developer: [All ▾]       │
│ Compare ←  ││                                                     │
│ Docs       ││  ┌─ Your Metrics ─────────┐┌─ Team Average ────────┐│
│            ││  │ Post-Open: 1.2 [P25]   ││ Post-Open: 2.3       ││
│ Filter     ││  │ 1st Pass:  85%  [P60]  ││ 1st Pass:  72%       ││
│ by Repo    ││  │ Token Cost: $12 [P45]  ││ Token Cost: $18      ││
│            ││  │ Messages:  8    [P30]  ││ Messages:  14        ││
│            ││  └────────────────────────┘└────────────────────────┘│
│            ││                                                     │
│            ││  ─── Trend Analysis ───                             │
│            ││  ┌──────────────────────────────────────────────────┐│
│            ││  │ Post-Open Commits        ↓ 20% improving        ││
│            ││  │  ╭──╮                                           ││
│            ││  │ ╭╯  ╰──╮                                        ││
│            ││  │╭╯      ╰─╮   ╭╮                                 ││
│            ││  │╯         ╰───╯╰──                               ││
│            ││  │ W1  W2  W3  W4  W5  W6  W7  W8                 ││
│            ││  │ ── You  ── Team Avg                             ││
│            ││  └──────────────────────────────────────────────────┘│
│            ││                                                     │
│            ││  ─── Developer Leaderboard ───                      │
│            ││  ┌────────────┬────────┬────────┬─────────┬────────┐│
│            ││  │ Developer  │ PRs    │ PostOp │ 1stPass │ Cost   ││
│            ││  ├────────────┼────────┼────────┼─────────┼────────┤│
│            ││  │ alice      │ 12     │ 0.8    │ 92%     │ $8.50  ││
│            ││  │ bob        │ 8      │ 2.1    │ 63%     │ $22.10 ││
│            ││  │ carol      │ 15     │ 1.5    │ 80%     │ $14.30 ││
│            ││  │ ── Team ── │ 35     │ 1.5    │ 78%     │ $15.00 ││
│            ││  └────────────┴────────┴────────┴─────────┴────────┘│
└────────────┘└─────────────────────────────────────────────────────┘
```

The page is a server component. It reads `searchParams` for `repo`, `author`, `since`, `until`. It calls the filtered data layer functions and renders:

1. **Filter bar** -- TimeWindowPicker + DeveloperSelector (client components)
2. **Side-by-side cards** -- individual vs team averages, with percentile badges
3. **Trend charts** -- line charts showing metric values bucketed by week, with individual and team-average lines overlaid
4. **Developer leaderboard table** -- all developers sorted by a selectable metric

#### 3b. Repo Comparison Page

**New file:** `dashboard/src/app/compare/repos/page.tsx`

Side-by-side metrics for 2-3 selected repos.

```
┌─────────────────────────────────────────────────────────────┐
│  Compare Repositories                                        │
│  [7d] [30d] [90d] [All]                                     │
│                                                              │
│  Select repos: [owner/repo-a ✓] [owner/repo-b ✓] [repo-c]  │
│                                                              │
│  ┌─ Token Cost / PR ─────────────────────────────┐           │
│  │   ██                                           │           │
│  │   ██  ▓▓                                       │           │
│  │   ██  ▓▓                                       │           │
│  │  repo-a  repo-b                                │           │
│  └────────────────────────────────────────────────┘           │
│                                                              │
│  ┌──────────┬──────────┬──────────┬──────────┐               │
│  │ Metric   │ repo-a   │ repo-b   │ Delta    │               │
│  ├──────────┼──────────┼──────────┼──────────┤               │
│  │ Post-Open│ 1.2      │ 3.1      │ +158%    │               │
│  │ 1st Pass │ 85%      │ 60%      │ -29%     │               │
│  │ Cost/PR  │ $12      │ $28      │ +133%    │               │
│  └──────────┴──────────┴──────────┴──────────┘               │
└─────────────────────────────────────────────────────────────┘
```

Repos are selected via `repos` query param (comma-separated IDs). The page fetches `getAggregateMetricsFiltered` for each selected repo and renders comparison bars and a delta table.

---

### Phase 4: Integrate into Existing Pages

#### 4a. Overview page enhancements

**Modify:** `/Users/austinroos/dev/ax/dashboard/src/app/page.tsx`

- Add TimeWindowPicker and DeveloperSelector to the header area, below the "Overview" title.
- Switch from `getAggregateMetrics(repoId)` to `getAggregateMetricsFiltered({repoId, author, since, until})`.
- Add percentile badges to each MetricCard when a developer is selected.
- Add trend direction indicators to each MetricCard (compare current period to previous period of equal length).

#### 4b. PR list page enhancements

**Modify:** `/Users/austinroos/dev/ax/dashboard/src/app/prs/page.tsx`

- Add TimeWindowPicker and DeveloperSelector.
- Add an "Author" column to the PR table.
- Filter the PR list using the query params.

#### 4c. Sidebar navigation

**Modify:** `/Users/austinroos/dev/ax/dashboard/src/app/layout.tsx`

- Add a "Compare" nav link between "Pull Requests" and "Docs" with a comparison icon (two overlapping bars).

---

### Phase 5: Trend Analysis Engine

**Addition to:** `dashboard/src/lib/db.ts`

The `getMetricTrend` function buckets PRs by time period (weekly or monthly) and computes the average metric value per bucket. It returns an array of `TrendBucket` objects that the trend chart component consumes.

For trend direction indicators, compute:
- Current period value (e.g., last 30d average)
- Previous period value (e.g., 30d before that)
- Percentage change
- Direction (improving/declining) based on a `lowerIsBetter` flag per metric

The `getPercentileContext` function:
1. Fetches all finalized PR values for the given metric within the time window
2. Sorts them
3. Finds the rank of the given value
4. Returns `{ percentile, teamAvg, teamMedian }`

---

### Implementation Sequencing

| Step | What | Depends On | Estimated Effort |
|------|------|-----------|-----------------|
| 1 | Add `author` column to prs (migration + parser + sync) | Nothing | Small |
| 2 | Filtered query functions in `db.ts` | Step 1 | Medium |
| 3 | TimeWindowPicker component | Nothing | Small |
| 4 | DeveloperSelector component | Step 2 (for developer list) | Small |
| 5 | PercentileBadge + TrendIndicator components | Step 2 | Small |
| 6 | ComparisonChart component | Nothing | Small |
| 7 | Compare page (`/compare`) | Steps 2-6 | Large |
| 8 | Repo comparison page (`/compare/repos`) | Steps 2, 3, 6 | Medium |
| 9 | Overview page integration | Steps 2-5 | Medium |
| 10 | PR list page integration | Steps 2-4 | Small |
| 11 | Sidebar nav update | Step 7 | Trivial |

Steps 1-2 are the foundation. Steps 3-6 are independent UI components that can be built in parallel. Steps 7-10 compose those components into pages.

---

### Design Considerations

**Fallback when no author data exists.** Before migration 4 runs and repos are re-synced, the `author` column will be NULL. The DeveloperSelector should show "No developer data -- run ax sync to populate" and gracefully degrade to showing team-only metrics. The Compare page should detect this and hide the individual vs team comparison, showing only time-based trends and repo comparison.

**Performance.** All filtered queries are in-process SQLite reads (via `better-sqlite3` in readonly mode). The current pattern loads all PRs into memory and filters in JS. For small-to-medium datasets (hundreds of PRs) this is fine. If performance becomes an issue, push filtering to SQL. The percentile computation is O(n log n) for sorting, which is negligible for expected data sizes.

**URL-driven state.** All filter state lives in URL search params (`?since=2026-03-01&until=2026-03-25&author=alice&repo=1`). This makes views shareable, bookmarkable, and compatible with server components. Client components update the URL; server components read from it.

**ADR-006 compliance.** Every comparison metric includes inline context about what "better" means for that metric. Percentile badges include tooltips explaining "75th percentile means 75% of team PRs had a lower value." Trend summaries use plain language ("Your token cost dropped 15% vs last month") rather than just arrows.

---

### Critical Files for Implementation

- `/Users/austinroos/dev/ax/dashboard/src/lib/db.ts` - Core data layer: all new filtered queries, percentile computation, developer listing, and trend bucketing go here
- `/Users/austinroos/dev/ax/internal/db/db.go` - Schema migration to add `author` column to `prs` table
- `/Users/austinroos/dev/ax/internal/parsers/github.go` - Must fetch PR author login from GitHub API and pass it through to the data model
- `/Users/austinroos/dev/ax/dashboard/src/app/page.tsx` - Overview page: integrate time window picker, developer selector, percentile badges, and trend indicators into existing metric cards
- `/Users/austinroos/dev/ax/dashboard/src/app/compare/page.tsx` - Primary new page: the comparison view bringing together all new components (does not exist yet, must be created)
