# Plan: Stream dashboard pages via Suspense + parallelize fetches

## Context

PR 1 (acroos/ax#87) added route-level `loading.tsx` skeletons and a top-bar
progress indicator. Navigation now *feels* instant because Next.js swaps in a
layout-matching skeleton the moment a link is clicked, instead of the old
behavior of hanging on the previous page until the server component's data
awaits resolved.

That's a perceived-performance win, but it doesn't change the fact that pages
take a long time to become interactive — the skeleton sits there for several
seconds while a single large Rails call runs, then the whole page pops in at
once. Two problems remain:

1. **The page shell is still blocked behind data.** On `/[slug]`, the `<h1>Overview</h1>`,
   the category headings, and the empty card grid *could* render in the first
   tens of milliseconds — but they don't, because the page awaits
   `getAggregateMetricsAsync` at the top before returning any JSX. The user
   stares at a generic skeleton even when parts of the page have nothing to do
   with the slow fetch.
2. **Sequential fetches where they should be parallel.** The overview page
   awaits `listReposAsync(slug)` *then* `getAggregateMetricsAsync(repoId, slug)`.
   The compare page fans out four derivations from one fetch (already
   consolidated into a single call in `[slug]/compare/page.tsx:53` — good), but
   nothing else does.

PR 2 addresses both: convert each page to render its shell synchronously and
stream data-dependent sections via Suspense, and clean up the remaining
sequential fetches.

---

## Goals

- **Sub-100ms time-to-first-paint of meaningful page chrome** on every route.
  The h1, category headings, filter bar, table header, etc. should appear
  before any Rails call returns.
- **Independent streaming per section.** On the overview, the Output Quality
  block should be able to render as soon as *its* data arrives, not wait for
  Agent Behavior data. (In practice all metrics come from one aggregate call
  today, so this benefit is modest — but the pattern sets us up well if
  per-category or per-metric fetches ever get split.)
- **No behavioral regressions.** Error states, empty states, repo filtering,
  time-window filtering, auth redirects all work the same way.
- **No new layout shift.** Section skeletons must match the final rendered
  layout tightly (we already have building blocks from PR 1's
  `src/components/skeleton.tsx`).

---

## Non-Goals

- **Server-side API latency work.** Profiling and speeding up Rails endpoints
  is a separate effort. PR 2 only changes how the dashboard consumes what the
  server returns.
- **Hover-prefetching data.** `<Link>` already prefetches route code. Data
  prefetching on hover is a worthwhile follow-up but out of scope here.
- **Replacing `loading.tsx` files.** Route-level skeletons stay. They handle
  the hard navigation case (slug change, cold route chunk) that Suspense
  streaming can't — Suspense only helps *after* the page component starts
  running.

---

## The streaming pattern

The core pattern Next.js 15+ / React 19 supports:

```tsx
// page.tsx — the page function itself does NOT await.
export default async function OrgOverviewPage({ params, searchParams }) {
  const { slug } = await params;
  const { repo } = await searchParams;
  const repoId = repo ? parseInt(repo, 10) : undefined;

  // Kick off fetches, don't await. These are now Promises.
  const metricsPromise = getAggregateMetricsAsync(repoId, slug);
  const repoLabelPromise = resolveRepoLabel(slug, repoId);

  return (
    <div>
      {/* Shell renders immediately — no await above this line. */}
      <div className="mb-8">
        <h1>Overview</h1>
        <Suspense fallback={<Skeleton className="h-4 w-64" />}>
          <RepoLabel promise={repoLabelPromise} />
        </Suspense>
      </div>

      <Suspense fallback={<SkeletonMetricCategory count={6} />}>
        <OutputQualitySection promise={metricsPromise} slug={slug} repoId={repoId} />
      </Suspense>
      <Suspense fallback={<SkeletonMetricCategory count={5} />}>
        <PromptEfficiencySection promise={metricsPromise} slug={slug} repoId={repoId} />
      </Suspense>
      {/* ...more sections, each with its own Suspense boundary */}
    </div>
  );
}

// Child async component awaits the promise — Suspense catches the suspension.
async function OutputQualitySection({ promise, slug, repoId }) {
  const metrics = await promise;
  return <div className="grid grid-cols-3 gap-3">{/* real cards */}</div>;
}
```

Key rules:

- **Pass promises, don't await at the page level.** Multiple child components
  can `await` the same promise — React dedupes and each Suspense boundary
  reveals independently.
- **Errors need `<ErrorBoundary>` or a try/catch inside the async child.** The
  current `try/catch metrics = await getAggregateMetricsAsync` pattern that
  returns an empty-state `<div>` has to move *into* the async child so the
  shell still renders.
- **`cookies()` / `headers()` can still be read inside async children.**
  The fetch path via `fetchAPI` already reads cookies; no change there.

---

## Per-page changes

### 1. `/(app)/[slug]/page.tsx` — Org Overview

**Current:** `page.tsx:98` awaits `getAggregateMetricsAsync` at the top and
dumps 22+ metric cards in three category blocks. Error state and empty state
short-circuit the render.

**After:**
- Page renders h1 + repo-filter subtitle + three category `<section>`s
  synchronously. Planning Effectiveness section is rendered conditionally
  based on a small signal (maybe a second lightweight call, or just always
  render it wrapped in Suspense and let it hide itself if `planDataCount === 0`).
- Each category is an async child that awaits the shared `metricsPromise`.
  Suspense fallback = `SkeletonMetricCategory`.
- Error boundary around each section (or an inline try/catch inside the async
  child) converts API failure into the existing "No data yet" message —
  scoped to the section that failed, not the whole page.
- Repo label resolves in its own tiny Suspense island so the subtitle doesn't
  block on `listReposAsync`.
- **Parallelization:** `listReposAsync` and `getAggregateMetricsAsync` become
  two promises kicked off together instead of sequential awaits.

**New helpers:** `resolveRepoLabel(slug, repoId)` extracted for reuse.

### 2. `/(app)/[slug]/prs/page.tsx` — PR List

**Current:** `prs/page.tsx:43` awaits `listPRsWithMetricsAsync` then renders
header + table.

**After:**
- Page renders h1 + placeholder count ("Loading pull requests…") + full
  table header synchronously.
- `<Suspense fallback={<SkeletonTableBody rows={10} />}>` wraps the `<tbody>`.
  Async child fetches and maps rows.
- PR count in the subtitle moves into the async child (it depends on data).
- Empty/error state renders inside the Suspense boundary's async child.

### 3. `/(app)/[slug]/compare/page.tsx` — Compare

**Current:** Already consolidated to a single fetch. `page.tsx:53` awaits it
then derives developers list, dev comparison, team metrics, and optionally
individual metrics.

**After:**
- Filter bar renders synchronously with an empty developer list (dropdown
  shows "Loading…"). Once PRs resolve, `DeveloperSelector` populates.
- Leaderboard table gets its own Suspense boundary.
- Individual-vs-team comparison cards (only shown when `author` param present)
  get their own Suspense boundary.
- Author list needs to reach the client-side `DeveloperSelector` — either
  move the selector render into an async wrapper that passes the resolved
  list, or pass a promise and use React.use on the client. Simpler: wrap
  the selector in Suspense.

### 4. `/(app)/[slug]/metrics/[metric]/page.tsx` — Metric Detail

**Current:** `metric/page.tsx:64` awaits `listPRsWithMetricsAsync`, does all
the stats/chart/table computation synchronously, then reads a local markdown
file (synchronous fs).

**After:**
- Header (title + category badge + back link) renders synchronously — it only
  depends on the metric slug, not PR data.
- The markdown doc is read from disk synchronously at the top — zero latency,
  no need to defer.
- **Three Suspense islands** below the header, each awaiting the same PR
  promise: summary stats (5 cards), chart panel, PR table. Each gets its
  own skeleton.
- The "About this metric" doc card renders synchronously at the bottom —
  no data dependency.

### 5. `/(app)/prs/[id]/page.tsx` — PR Detail

**Current:** `prs/[id]/page.tsx:197` awaits `getPRWithMetricsAsync(prId)` then
renders everything.

**After:**
- Back link ("← Pull Requests") renders synchronously — no data needed.
- Header (PR title, state badge, size badge, metadata row) depends on PR data.
  Wrap in its own Suspense with a header skeleton.
- Metric category groups get a shared Suspense. (Splitting per-category here
  provides no benefit since all fields come from one fetch.)

### 6. `/(app)/[slug]/settings/page.tsx` — Org Settings

**Current:** `settings/page.tsx:29` already uses `Promise.all` for the three
fetches (installation, members, invites) — good. But the page still blocks
on all three before rendering anything.

**After:**
- Header + auth check render synchronously (the auth check stays at the top
  since an unauthed user redirects).
- Three Suspense islands, one per card (GitHub App, Members, Invites).
  Each awaits its own promise independently, so whichever comes back first
  renders first.

### 7. `/(app)/[slug]/billing/page.tsx` — Billing

**Current:** Two parallel fetches (billing, members) already via
`Promise.all`. Same blocking-on-both issue as settings.

**After:**
- Header + query-param-driven success/canceled banners render synchronously.
- Billing card in its own Suspense boundary.

### 8. `/(app)/settings/page.tsx` — Account

**Current:** `settings/page.tsx:7` awaits `getCurrentUser()`. `ApiKeySection`
is a client component.

**After:** Minimal change. `getCurrentUser` is fast (just reads the session
cookie) so streaming doesn't help much. Optional refactor for consistency:
move the profile card into its own Suspense.

**Skip** this page unless it's trivial.

---

## Shared helpers / primitives

- **`src/components/error-boundary.tsx`** — Minimal client-side error
  boundary that renders a fallback on section-level fetch failure. Replaces
  the current top-of-page try/catch pattern.
- **Extend `src/components/skeleton.tsx`:**
  - `SkeletonTableBody({ rows, columns })` — for PR list + metric detail.
  - `SkeletonChartPanel` — for the metric-detail chart (mirrors the panel
    shell so the legend position doesn't jump).
- Consider a tiny `<AsyncValue promise={…}>{(value) => …}</AsyncValue>` helper
  to avoid a named async component per tiny value (repo label, PR count). Optional.

---

## Implementation order

1. **Groundwork:** error boundary component, skeleton extensions (table body,
   chart panel). ~30 min.
2. **Overview page** (`/[slug]`). Highest-visibility page; validates the
   pattern end-to-end. ~45 min.
3. **PR list** (`/[slug]/prs`). Table streaming is a clean case. ~20 min.
4. **Metric detail** (`/[slug]/metrics/[metric]`). Three-island streaming.
   ~30 min.
5. **PR detail** (`/prs/[id]`). Similar to overview. ~20 min.
6. **Compare** (`/[slug]/compare`). Filter-bar-before-data is the interesting
   case. ~30 min.
7. **Org settings** + **billing**. Parallel-card pattern. ~20 min each.
8. **Wiki update** + **log entry**. ~15 min.

Single PR is fine — each page is an independent refactor and there's no
cross-page coupling. The common primitives land in step 1.

---

## Risks & gotchas

- **`searchParams` / `params` must be awaited before passing downstream.**
  They're `Promise` in Next.js 15+. We already await them in every page —
  keep that at the page top.
- **Dynamic APIs inside async children.** `cookies()` / `headers()` work, but
  anything that calls `redirect()` inside a Suspense child gets wrapped in an
  error-looking flow. Keep auth redirects at the page level, above any
  Suspense boundary.
- **`revalidatePath` and cache.** `fetchAPI` defaults to `next: { revalidate:
  60 }` — that's unchanged. Promises passed to multiple children resolve once
  (React dedupes), so there's no extra fetch traffic from this refactor.
- **Client-component boundaries.** Any `<Suspense>` wrapping a component that
  internally renders a client component (e.g., `TimeWindowPicker`) works
  fine — the client component hydrates after streaming completes.
- **TypeScript on promise-as-prop.** Async children take
  `{ promise: Promise<X> }` instead of `{ data: X }`. Straightforward but
  worth getting right in one place to avoid inconsistency.
- **Error states that used to replace the whole page.** The overview and PR
  list pages currently return an early "No data yet" when the API throws. In
  the streaming model, that should become a section-level fallback (via an
  error boundary) so the shell and unrelated sections still render. Make
  sure the UX still communicates clearly that the whole page's data is
  missing when the fetch fails — not just a single card.

---

## Success criteria

- [ ] Every page's chrome (h1, subtitle, section headings, table headers)
      renders in the first paint, before any Rails call returns.
- [ ] Each data-dependent section has its own skeleton that mirrors its
      final layout with no shift.
- [ ] API failure degrades gracefully at the section level (not whole-page).
- [ ] No change to revalidation, caching, or auth behavior.
- [ ] `just dashboard-build` succeeds, `npx tsc --noEmit` clean.
- [ ] Wiki `dashboard.md` updated; `wiki/log.md` entry added.
