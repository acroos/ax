# Plan: Complete Dashboard Metrics Coverage

## Context

The dashboard's PR detail page shows all 15 PR-level metrics, but the aggregate views (overview, PR list, compare) only surface 9 of them. Plan analysis data (coverage, deviation, scope creep) and several other metrics (diff churn, line revisit rate, iteration depth, error recovery, unmerged token spend) are computed and stored but never appear on aggregate pages. This makes the dashboard feel incomplete — users see plan analysis in CLI output but can't find it in the UI.

## What's Missing (by page)

| Metric | Overview | PR List | Compare | PR Detail |
|--------|----------|---------|---------|-----------|
| Diff Churn | - | - | - | yes |
| Line Revisit Rate | - | - | - | yes |
| Iteration Depth | - | - | - | yes |
| Error Recovery | - | - | - | yes |
| Plan Coverage | - | - | - | yes |
| Plan Deviation | - | - | - | yes |
| Scope Creep | - | - | - | yes |
| Unmerged Token Spend | - | - | - | - |

## Implementation

### Step 1: Extend data layer (`dashboard/src/lib/db.ts`)

Add to `AggregateMetrics` interface (line 117):
```typescript
avgDiffChurnLines: number | null;
avgLineRevisitRate: number | null;
avgErrorRecoveryAttempts: number | null;
avgPlanCoverage: number | null;
avgPlanDeviation: number | null;
scopeCreepRate: number | null;  // fraction of PRs with scope_creep_detected=1
planDataCount: number;           // how many PRs had plan data (for coverage indicator)
```

Add new interface:
```typescript
export interface RepoLevelMetrics {
  unmergedCostUSD: number | null;
  totalCostUSD: number | null;
  unmergedRate: number | null;
}
```

Update `computeAggregates()` to compute these 6 new fields from `PRWithMetrics[]`. Same pattern as existing: filter non-null, average, return null if no data.

Add `getRepoLevelMetrics()` / `getRepoLevelMetricsAsync()` that queries `repo_metrics` table.

### Step 2: Server-side parity (`internal/server/handlers.go`)

Update `computeAggregates` in the Go server to return the same 6 new fields for API mode. Add accumulators for diff churn, line revisit, error recovery, plan coverage, plan deviation, scope creep.

### Step 3: Reorganize Overview page (`dashboard/src/app/page.tsx`)

Current: flat 3x3 grid of 9 cards.

New: category sections with headers, each containing a 3-column grid.

- **Summary banner** (top): Total PRs + Total Token Spend + Unmerged Token Spend (when available)
- **Output Quality** (6 cards): Post-Open Commits, First-Pass Acceptance, CI Success, Test Coverage, Diff Churn, Line Revisit Rate
- **Prompt Efficiency** (3 cards): Messages/PR, Iteration Depth, Token Cost/PR
- **Agent Behavior** (3 cards): Self-Correction, Context Efficiency, Error Recovery
- **Planning Effectiveness** (3 cards): Plan Coverage, Plan Deviation, Scope Creep Rate
  - Show "(data from N of M PRs)" in section header when coverage is low
  - Hide section entirely if zero PRs have plan data

Keep existing trend charts (Token Cost, Messages per PR) below the category sections.

### Step 4: Add PR list to overview page bottom (`dashboard/src/app/page.tsx`)

Add a "Recent PRs" table at the bottom of the overview page showing all finalized PRs for the selected repo. Reuse the same table pattern from the PR list page (number, title, size, state, key metrics). Each row links to `/prs/[id]` for full details.

### Step 5: Make metric cards clickable — drill-down view

Each metric card on the overview page becomes clickable. Clicking opens a drill-down view (could be a modal, slide-over, or inline expansion) showing:
- **Per-PR breakdown**: a chart (bar or scatter) showing how each PR scored on that metric, so the user can see which PRs are pulling the average up or down
- **Metric explanation**: the full description from `docs/metrics/[slug]` — what it measures, why it matters, how to interpret values

This is a **next step** — design and implement after Steps 1-4 and 6-7 are complete. The card click behavior and drill-down component will be its own unit of work.

### Step 6: Add columns to PR list (`dashboard/src/app/prs/page.tsx`)

Add 2 columns (table is already wide, keep it minimal):
- **Depth** (iteration_depth) — next to Messages column
- **Churn** (diff_churn_lines) — next to Post-Open Commits

### Step 7: Extend Compare page (`dashboard/src/app/compare/page.tsx`)

Leaderboard: add Iteration Depth, Error Recovery columns.
Individual vs Team cards: add Diff Churn, Iteration Depth, Error Recovery, Line Revisit Rate.

## Files to Modify

1. `dashboard/src/lib/db.ts` — interfaces, computeAggregates, new query functions
2. `internal/server/handlers.go` — server-side aggregation
3. `dashboard/src/app/page.tsx` — overview layout + new cards
4. `dashboard/src/app/prs/page.tsx` — 2 new table columns
5. `dashboard/src/app/compare/page.tsx` — leaderboard + comparison cards

## Implementation Order

**Phase 1 (this session):** Steps 1-4, 6-7 — data layer, all three aggregate pages, PR list on overview
**Phase 2 (next step):** Step 5 — clickable metric drill-downs with per-PR charts and metric docs

## Verification

1. `ax sync --repo .` on a repo with session + plan data
2. Check overview page shows all 4 category sections with populated cards
3. Check overview page shows PR list at the bottom
4. Check PR list page shows Depth and Churn columns
5. Check compare page shows new leaderboard columns
6. Verify API mode parity: `ax server` + dashboard pointed at API returns same metrics
7. Verify graceful handling: repo with no plan data should hide Planning section, not show dashes
