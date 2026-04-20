import fs from "fs";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import path from "path";
import { Suspense } from "react";

import { BooleanMetricSummary } from "@/components/boolean-metric-summary";
import { Markdown } from "@/components/markdown";
import {
  MetricTrendChart,
  type DailyPoint,
} from "@/components/metric-trend-chart";
import { RangeToggle, type Range } from "@/components/range-toggle";
import { SectionErrorBoundary } from "@/components/section-error-boundary";
import { Skeleton, SkeletonChartPanel } from "@/components/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { PRWithMetrics } from "@/lib/db";
import { listTeamPRsAsync } from "@/lib/db";
import {
  formatMetricValue,
  getMetricDef,
  type MetricDefEntry,
} from "@/lib/metric-defs";

const metricsDir = path.join(process.cwd(), "..", "docs", "metrics");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_RANGES: Range[] = ["7d", "30d", "90d"];
const RANGE_DAYS: Record<Range, number> = { "7d": 7, "30d": 30, "90d": 90 };

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

function getTimestamp(pr: PRWithMetrics): number | null {
  const dateStr = pr.merged_at ?? pr.closed_at ?? pr.created_at;
  if (!dateStr) return null;
  return new Date(dateStr).getTime();
}

interface PRValue {
  prId: number;
  prNumber: number;
  title: string;
  value: number;
  state: string;
  timestamp: number;
}

function extractPRValues(prs: PRWithMetrics[], def: MetricDefEntry): PRValue[] {
  const values: PRValue[] = [];
  for (const pr of prs) {
    if (!pr.metrics) continue;
    const raw = pr.metrics[def.field];
    if (raw === null || raw === undefined) continue;
    const ts = getTimestamp(pr);
    if (!ts) continue;
    values.push({
      prId: pr.id,
      prNumber: pr.number,
      title: pr.title || `PR #${pr.number}`,
      value: raw as number,
      state: pr.state || "unknown",
      timestamp: ts,
    });
  }
  return values.sort((a, b) => a.timestamp - b.timestamp);
}

function filterByRange(values: PRValue[], range: Range): PRValue[] {
  const days = RANGE_DAYS[range];
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return values.filter((v) => v.timestamp >= cutoff);
}

/** Group PRs by calendar day and compute per-day averages + ranges. */
function aggregateByDay(values: PRValue[]): DailyPoint[] {
  const byDay = new Map<
    string,
    { vals: number[]; ts: number }
  >();
  for (const v of values) {
    const dayKey = new Date(v.timestamp).toISOString().slice(0, 10);
    const existing = byDay.get(dayKey);
    if (existing) {
      existing.vals.push(v.value);
    } else {
      byDay.set(dayKey, {
        vals: [v.value],
        ts: new Date(dayKey + "T12:00:00Z").getTime(),
      });
    }
  }
  return [...byDay.values()]
    .map((d) => {
      const avg = d.vals.reduce((s, v) => s + v, 0) / d.vals.length;
      const min = Math.min(...d.vals);
      const max = Math.max(...d.vals);
      return {
        timestamp: d.ts,
        avg,
        min,
        max,
        count: d.vals.length,
        range: [avg - min, max - avg] as [number, number],
      };
    })
    .sort((a, b) => a.timestamp - b.timestamp);
}

// ---------------------------------------------------------------------------
// Distribution bucketing
// ---------------------------------------------------------------------------

interface DistBucket {
  label: string;
  count: number;
  pct: number;
}

function computeDistribution(
  values: number[],
  def: MetricDefEntry,
): DistBucket[] {
  if (values.length === 0) return [];

  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  if (def.valueType === "ratio") {
    const bands = Array.from({ length: 10 }, (_, i) => ({
      label: `${i * 10}\u2013${(i + 1) * 10}%`,
      count: 0,
    }));
    for (const v of values) {
      bands[Math.min(Math.floor(v * 10), 9)].count++;
    }
    const first = bands.findIndex((b) => b.count > 0);
    const last = bands.findLastIndex((b) => b.count > 0);
    const trimmed = bands.slice(first, last + 1);
    const maxCount = Math.max(...trimmed.map((b) => b.count));
    return trimmed.map((b) => ({
      label: b.label,
      count: b.count,
      pct: maxCount > 0 ? b.count / maxCount : 0,
    }));
  }

  const range = max - min;
  if (range === 0) {
    return [
      { label: formatMetricValue(min, def), count: values.length, pct: 1 },
    ];
  }

  const targetBuckets = 6;
  let step: number;

  if (def.valueType === "int") {
    step = Math.max(1, Math.ceil(range / targetBuckets));
  } else {
    const raw = range / targetBuckets;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    step = Math.ceil(raw / mag) * mag;
  }

  const bucketStart = Math.floor(min / step) * step;
  const buckets: { label: string; count: number }[] = [];

  for (let lo = bucketStart; lo <= max; lo += step) {
    const hi = lo + step;
    const isLast = hi > max;
    const count = values.filter(
      (v) => v >= lo && (isLast ? v <= hi : v < hi),
    ).length;

    let label: string;
    if (def.valueType === "int" && step === 1) {
      label = String(Math.round(lo));
    } else if (def.unit === "$") {
      label = `$${lo.toFixed(0)}\u2013$${hi.toFixed(0)}`;
    } else if (def.valueType === "int") {
      label = `${Math.round(lo)}\u2013${Math.round(hi - 1)}`;
    } else {
      label = `${lo.toFixed(1)}\u2013${hi.toFixed(1)}`;
    }

    buckets.push({ label, count });
  }

  const first = buckets.findIndex((b) => b.count > 0);
  const last = buckets.findLastIndex((b) => b.count > 0);
  const trimmed = buckets.slice(first, last + 1);
  const maxCount = Math.max(...trimmed.map((b) => b.count));
  return trimmed.map((b) => ({
    label: b.label,
    count: b.count,
    pct: maxCount > 0 ? b.count / maxCount : 0,
  }));
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function TeamMetricDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; team: string; metric: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { slug, team: teamSlug, metric } = await params;
  const { range: rangeParam } = await searchParams;
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

  const backHref = `/${slug}/teams/${teamSlug}`;
  const prsPromise = listTeamPRsAsync(slug, teamSlug).catch(
    () => [] as PRWithMetrics[],
  );

  return (
    <div>
      <Link
        href={backHref}
        className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-3.5" aria-hidden />
        Back to team
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
          <DataCountSubtitle promise={prsPromise} def={def} range={range} />
        </Suspense>
      </div>

      {def.valueType !== "boolean" ? (
        <SectionErrorBoundary
          fallback={<DataSectionsSkeleton />}
        >
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
          <SectionErrorBoundary
            fallback={<SkeletonChartPanel title="Summary" />}
          >
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

async function DataCountSubtitle({
  promise,
  def,
  range,
}: {
  promise: Promise<PRWithMetrics[]>;
  def: MetricDefEntry;
  range: Range;
}) {
  const prs = await promise;
  const allValues = extractPRValues(prs, def);
  const values = filterByRange(allValues, range);
  return (
    <p className="mt-1 text-[13px] text-muted-foreground">
      {values.length} PR{values.length !== 1 && "s"} with data in past {range}
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
