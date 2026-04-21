import fs from "fs";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import path from "path";
import { Suspense } from "react";

import { BooleanMetricSummary } from "@/components/boolean-metric-summary";
import { Markdown } from "@/components/markdown";
import { MetricTrendChart } from "@/components/metric-trend-chart";
import { RangeToggle, type Range } from "@/components/range-toggle";
import { SectionErrorBoundary } from "@/components/section-error-boundary";
import { Skeleton, SkeletonChartPanel } from "@/components/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { PRWithMetrics } from "@/lib/db";
import { listPRsWithMetricsAsync, listReposAsync } from "@/lib/db";
import { RepoFilter } from "@/components/repo-filter";
import {
  formatMetricValue,
  getMetricDef,
  type MetricDefEntry,
} from "@/lib/metric-defs";
import {
  RANGE_DAYS,
  percentile,
  extractPRValues,
  filterByRange,
  aggregateByDay,
  computeDistribution,
  type PRValue,
  type DistBucket,
} from "@/lib/metric-utils";

const metricsDir = path.join(process.cwd(), "..", "docs", "metrics");

const VALID_RANGES: Range[] = ["7d", "30d", "90d"];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function MetricDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; metric: string }>;
  searchParams: Promise<{ repo?: string; range?: string }>;
}) {
  const { slug, metric } = await params;
  const { repo, range: rangeParam } = await searchParams;
  const repoId = repo ? parseInt(repo, 10) : undefined;
  const range: Range = VALID_RANGES.includes(rangeParam as Range)
    ? (rangeParam as Range)
    : "30d";
  const def = getMetricDef(metric);

  if (!def) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="space-y-3 text-center">
          <h2 className="text-lg font-medium text-foreground">
            Metric not found
          </h2>
          <p className="text-sm text-muted-foreground">
            No metric with slug <code className="text-primary">{metric}</code>
          </p>
        </div>
      </div>
    );
  }

  let docContent = "";
  try {
    const filePath = path.join(metricsDir, `${def.docSlug}.md`);
    docContent = fs.readFileSync(filePath, "utf-8");
  } catch {
    // Doc file missing — not critical
  }

  const backHref = repoId ? `/${slug}?repo=${repoId}` : `/${slug}`;
  const prsPromise = listPRsWithMetricsAsync(repoId, slug, { per_page: 100 })
    .then((r) => r.data)
    .catch(() => [] as PRWithMetrics[]);
  const reposPromise = listReposAsync(slug).catch(() => []);

  return (
    <div>
      <Link
        href={backHref}
        className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-3.5" aria-hidden />
        Back to Overview
      </Link>

      <div className="mb-6 mt-4">
        <div className="flex items-baseline justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">
              {def.label}
            </h1>
            <Badge variant="outline" className="text-muted-foreground">
              {def.category}
            </Badge>
          </div>
          <RangeToggle current={range} />
        </div>
        <Suspense fallback={<Skeleton className="mt-1 h-4 w-40" />}>
          <DataCountSubtitle
            promise={prsPromise}
            reposPromise={reposPromise}
            repoId={repoId}
            def={def}
            range={range}
          />
        </Suspense>
      </div>

      {def.valueType !== "boolean" ? (
        <SectionErrorBoundary>
          <Suspense fallback={<DataSectionsSkeleton />}>
            <MetricDataSections
              promise={prsPromise}
              def={def}
              range={range}
              slug={slug}
            />
          </Suspense>
        </SectionErrorBoundary>
      ) : (
        <div className="mb-6">
          <SectionErrorBoundary>
            <Suspense fallback={<SkeletonChartPanel title="Summary" />}>
              <BooleanPanel promise={prsPromise} def={def} />
            </Suspense>
          </SectionErrorBoundary>
        </div>
      )}

      {docContent && (
        <Card className="p-6">
          <CardContent className="p-0">
            <h2 className="mb-4 text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
              About This Metric
            </h2>
            <Markdown content={docContent} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Async islands
// ---------------------------------------------------------------------------

type RepoLite = {
  id: number;
  github_owner: string | null;
  github_repo: string | null;
};

async function DataCountSubtitle({
  promise,
  reposPromise,
  repoId,
  def,
  range,
}: {
  promise: Promise<PRWithMetrics[]>;
  reposPromise: Promise<RepoLite[]>;
  repoId: number | undefined;
  def: MetricDefEntry;
  range: Range;
}) {
  const [prs, allRepos] = await Promise.all([promise, reposPromise]);
  const repos = allRepos.filter(
    (r): r is RepoLite & { github_owner: string; github_repo: string } =>
      r.github_owner !== null && r.github_repo !== null,
  );
  const allValues = extractPRValues(prs, def);
  const values = filterByRange(allValues, range);
  return (
    <p className="mt-1 text-[13px] text-muted-foreground">
      <RepoFilter repos={repos} current={repoId} />
      {" "}&middot; {values.length} PR{values.length !== 1 && "s"} with data in
      past {range}
      {allValues.length > values.length && (
        <span className="text-muted-foreground/60">
          {" "}
          ({allValues.length} total)
        </span>
      )}
    </p>
  );
}

async function MetricDataSections({
  promise,
  def,
  range,
  slug,
}: {
  promise: Promise<PRWithMetrics[]>;
  def: MetricDefEntry;
  range: Range;
  slug: string;
}) {
  const prs = await promise;
  const allValues = extractPRValues(prs, def);
  const values = filterByRange(allValues, range);

  if (values.length === 0) {
    return (
      <div className="mb-6 flex h-40 items-center justify-center rounded-lg border border-dashed border-border text-[13px] text-muted-foreground">
        No data for this metric in the selected period.
      </div>
    );
  }

  // -- Stats --
  const numericValues = values.map((v) => v.value);
  const sorted = [...numericValues].sort((a, b) => a - b);
  const avg = numericValues.reduce((s, v) => s + v, 0) / numericValues.length;
  const p10 = percentile(sorted, 10);
  const p50 = percentile(sorted, 50);
  const p90 = percentile(sorted, 90);

  // Prior period for deltas
  const days = RANGE_DAYS[range];
  const rangeStart = Date.now() - days * 24 * 60 * 60 * 1000;
  const priorStart = rangeStart - days * 24 * 60 * 60 * 1000;
  const priorValues = allValues.filter(
    (v) => v.timestamp >= priorStart && v.timestamp < rangeStart,
  );
  const priorNums = priorValues.map((v) => v.value);
  const priorSorted = [...priorNums].sort((a, b) => a - b);

  function makeDelta(current: number, prior: number | null): string | undefined {
    if (prior === null) return undefined;
    const diff = current - prior;
    if (Math.abs(diff) < 0.005) return `\u2014 no change vs prior ${range}`;
    const arrow = diff > 0 ? "\u2191" : "\u2193";
    return `${arrow} ${formatMetricValue(Math.abs(diff), def)} vs prior ${range}`;
  }

  const priorAvg = priorNums.length > 0
    ? priorNums.reduce((s, v) => s + v, 0) / priorNums.length
    : null;
  const priorP10 = priorSorted.length > 0 ? percentile(priorSorted, 10) : null;
  const priorP50 = priorSorted.length > 0 ? percentile(priorSorted, 50) : null;
  const priorP90 = priorSorted.length > 0 ? percentile(priorSorted, 90) : null;

  // -- Trend chart data --
  const dailyData = aggregateByDay(values);

  // -- Distribution --
  const distribution = computeDistribution(numericValues, def);

  // -- Notable PRs: top 3 highest + top 3 lowest --
  const byValue = [...values].sort((a, b) => b.value - a.value);
  const highest = byValue.slice(0, 3);
  const highestIds = new Set(highest.map((p) => p.prId));
  const lowest = byValue
    .slice(-3)
    .reverse()
    .filter((p) => !highestIds.has(p.prId));

  const stats: { label: string; value: string; delta?: string }[] = [
    { label: "Count", value: String(values.length) },
    { label: "Average", value: formatMetricValue(avg, def), delta: makeDelta(avg, priorAvg) },
    { label: "P10", value: formatMetricValue(p10, def), delta: makeDelta(p10, priorP10) },
    { label: "P50", value: formatMetricValue(p50, def), delta: makeDelta(p50, priorP50) },
    { label: "P90", value: formatMetricValue(p90, def), delta: makeDelta(p90, priorP90) },
  ];

  return (
    <>
      {/* Summary stats */}
      <div className="mb-6 grid grid-cols-5 gap-3">
        {stats.map((stat) => (
          <Card key={stat.label} className="p-4 text-center">
            <CardContent className="p-0">
              <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {stat.label}
              </div>
              <div className="font-mono text-[20px] font-medium text-foreground">
                {stat.value}
              </div>
              {stat.delta && (
                <div className="mt-1 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  {stat.delta}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Trend chart */}
      <Card className="mb-6 p-5">
        <CardContent className="p-0">
          <h2 className="mb-4 text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
            Trend
          </h2>
          <MetricTrendChart
            dailyData={dailyData}
            unit={def.unit}
            isRatio={def.valueType === "ratio"}
            average={avg}
          />
        </CardContent>
      </Card>

      {/* Distribution + Notable PRs */}
      <div className="mb-6 grid grid-cols-2 gap-3">
        <Card className="p-5">
          <CardContent className="p-0">
            <h2 className="mb-4 text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
              Distribution
            </h2>
            <Distribution data={distribution} />
          </CardContent>
        </Card>
        <Card className="p-5">
          <CardContent className="p-0">
            <h2 className="mb-4 text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
              Notable PRs
            </h2>
            <NotablePRs
              highest={highest}
              lowest={lowest}
              def={def}
              slug={slug}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

async function BooleanPanel({
  promise,
  def,
}: {
  promise: Promise<PRWithMetrics[]>;
  def: MetricDefEntry;
}) {
  const prs = await promise;
  const values = extractPRValues(prs, def);
  return (
    <Card className="p-5">
      <CardContent className="p-0">
        <h2 className="mb-4 text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
          Summary
        </h2>
        <BooleanMetricSummary
          entries={values.map((p) => ({
            prId: p.prId,
            prNumber: p.prNumber,
            title: p.title,
            value: p.value === 1,
          }))}
          trueIsBetter={!def.lowerIsBetter}
        />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Presentational components (server-rendered)
// ---------------------------------------------------------------------------

function Distribution({ data }: { data: DistBucket[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-[12px] text-muted-foreground">
        Not enough data
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {data.map((bucket) => (
        <div key={bucket.label} className="flex items-center gap-2">
          <span className="w-[72px] shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
            {bucket.label}
          </span>
          <div className="relative h-5 flex-1 overflow-hidden rounded bg-muted">
            <div
              className="absolute inset-y-0 left-0 rounded bg-clay-600 dark:bg-clay-dark-500"
              style={{
                width: `${Math.max(bucket.pct * 100, bucket.count > 0 ? 4 : 0)}%`,
                opacity: 0.75,
              }}
            />
          </div>
          <span className="w-6 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
            {bucket.count}
          </span>
        </div>
      ))}
    </div>
  );
}

function NotablePRs({
  highest,
  lowest,
  def,
  slug,
}: {
  highest: PRValue[];
  lowest: PRValue[];
  def: MetricDefEntry;
  slug: string;
}) {
  if (highest.length === 0 && lowest.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-[12px] text-muted-foreground">
        Not enough data
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {highest.length > 0 && (
        <div>
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Highest
          </div>
          <PRList entries={highest} def={def} slug={slug} />
        </div>
      )}
      {lowest.length > 0 && (
        <div>
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Lowest
          </div>
          <PRList entries={lowest} def={def} slug={slug} />
        </div>
      )}
    </div>
  );
}

function PRList({
  entries,
  def,
  slug,
}: {
  entries: PRValue[];
  def: MetricDefEntry;
  slug: string;
}) {
  return (
    <div className="space-y-0.5">
      {entries.map((pr) => (
        <Link
          key={pr.prId}
          href={`/${slug}/prs/${pr.prId}`}
          className="flex items-center gap-2 rounded px-2 py-1.5 text-[12px] transition-colors hover:bg-accent"
        >
          <span className="shrink-0 font-medium text-primary">
            #{pr.prNumber}
          </span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            {pr.title}
          </span>
          <span className="shrink-0 font-mono text-foreground">
            {formatMetricValue(pr.value, def)}
          </span>
        </Link>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeletons
// ---------------------------------------------------------------------------

function DataSectionsSkeleton() {
  return (
    <>
      {/* Stats */}
      <div className="mb-6 grid grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="p-4 text-center">
            <CardContent className="p-0">
              <Skeleton className="mx-auto mb-2 h-3 w-16" />
              <Skeleton className="mx-auto h-5 w-12" />
            </CardContent>
          </Card>
        ))}
      </div>
      {/* Chart */}
      <Card className="mb-6 p-5">
        <CardContent className="p-0">
          <Skeleton className="mb-4 h-3 w-20" />
          <Skeleton className="h-[280px] w-full" />
        </CardContent>
      </Card>
      {/* Distribution + Notable PRs */}
      <div className="mb-6 grid grid-cols-2 gap-3">
        <Card className="p-5">
          <CardContent className="p-0">
            <Skeleton className="mb-4 h-3 w-28" />
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-5 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
        <Card className="p-5">
          <CardContent className="p-0">
            <Skeleton className="mb-4 h-3 w-24" />
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-5 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
