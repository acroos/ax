export const runtime = "edge";

import Link from "next/link";
import { Suspense } from "react";
import { getMyMetricsAsync } from "@/lib/db";
import type { AggregateMetrics, SparklinePoint } from "@/lib/db";
import { METRIC_DEFS } from "@/lib/metric-defs";
import { Skeleton, SkeletonMetricCategory } from "@/components/skeleton";
import { SectionErrorBoundary } from "@/components/section-error-boundary";
import { SectionDivider } from "@/components/section-divider";
import { Sparkline } from "@/components/sparkline";
import { Card, CardContent } from "@/components/ui/card";
import { ClientTooltip } from "@/components/client-tooltip";
import { RangeToggle, type Range } from "@/components/range-toggle";

const METRIC_INFO = Object.fromEntries(METRIC_DEFS.map((d) => [d.slug, d]));

const VALID_RANGES: Range[] = ["7d", "30d", "90d"];

function MetricCard({
  label,
  value,
  tooltip,
  href,
  delta,
  sparkline,
}: {
  label: string;
  value: string;
  tooltip?: string;
  href?: string;
  delta?: string;
  sparkline?: SparklinePoint[];
}) {
  const card = (
    <Card
      className={`gap-0 p-5 transition-colors ${
        href ? "hover:border-primary/30 hover:bg-accent/40 cursor-pointer" : ""
      }`}
    >
      <CardContent className="p-0">
        <div className="mb-3 text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="mb-1 font-serif text-[28px] font-medium leading-none tracking-tight text-foreground [font-variant-numeric:lining-nums_tabular-nums]">
          {value}
        </div>
        {delta && (
          <div className="mt-1 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            {delta}
          </div>
        )}
        <div className="mt-4 h-16 w-full">
          {sparkline && sparkline.length > 0 && (
            <Sparkline data={sparkline} className="h-full w-full" />
          )}
        </div>
      </CardContent>
    </Card>
  );

  const tipped = tooltip ? (
    <ClientTooltip content={<p>{tooltip}</p>} side="top" className="max-w-[280px]">
      {card}
    </ClientTooltip>
  ) : (
    card
  );

  return href ? (
    <Link href={href} className="block">
      {tipped}
    </Link>
  ) : (
    tipped
  );
}

function fmt(n: number | null, decimals = 1): string {
  if (n === null) return "\u2014";
  return n.toFixed(decimals);
}

function fmtPct(n: number | null): string {
  if (n === null) return "\u2014";
  return `${Math.round(n * 100)}%`;
}

function fmtCost(n: number | null): string {
  if (n === null) return "\u2014";
  return `$${n.toFixed(2)}`;
}

function fmtDelta(
  current: number | null,
  prior: number | null,
  formatter: (n: number | null) => string,
  rangeLabel: string,
): string | undefined {
  if (current === null || prior === null) return undefined;
  const diff = current - prior;
  if (Math.abs(diff) < 0.005) return undefined;
  const arrow = diff > 0 ? "\u2191" : "\u2193";
  return `${arrow} ${formatter(Math.abs(diff))} vs prior ${rangeLabel}`;
}

export default async function MyOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { slug } = await params;
  const { range: rangeParam } = await searchParams;
  const range: Range = VALID_RANGES.includes(rangeParam as Range)
    ? (rangeParam as Range)
    : "30d";

  const metricsPromise = getMyMetricsAsync(slug, range);

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-baseline justify-between">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">
            My Dashboard
          </h1>
          <RangeToggle current={range} />
        </div>
        <Suspense fallback={<Skeleton className="mt-1 h-4 w-64" />}>
          <MySubtitle metricsPromise={metricsPromise} range={range} />
        </Suspense>
      </div>

      <SectionErrorBoundary fallback={<NoDataState />}>
        <Suspense fallback={<OverviewMetricsSkeleton />}>
          <MyMetricsBody
            metricsPromise={metricsPromise}
            slug={slug}
            range={range}
          />
        </Suspense>
      </SectionErrorBoundary>

      <div className="mt-6">
        <Link
          href={`/${slug}/me/prs`}
          className="text-[13px] text-primary transition-colors hover:underline"
        >
          View all my pull requests →
        </Link>
      </div>
    </div>
  );
}

async function MySubtitle({
  metricsPromise,
  range,
}: {
  metricsPromise: Promise<AggregateMetrics>;
  range: Range;
}) {
  let metrics: AggregateMetrics | null = null;
  try {
    metrics = await metricsPromise;
  } catch {
    // Metrics body's error boundary will show "No data yet"
  }
  return (
    <p className="mt-1 text-[13px] text-muted-foreground">
      {metrics !== null && (
        <>
          {metrics.totalPRs} finalized PR
          {metrics.totalPRs !== 1 && "s"} in past {range}
        </>
      )}
    </p>
  );
}

function OverviewMetricsSkeleton() {
  return (
    <>
      <SkeletonMetricCategory count={3} />
      <SkeletonMetricCategory count={3} />
      <SkeletonMetricCategory count={3} />
    </>
  );
}

function NoDataState() {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <div className="space-y-3 text-center">
        <h2 className="text-lg font-medium text-foreground">No data yet</h2>
        <p className="text-sm text-muted-foreground">
          Metrics appear once your pull requests are merged or closed.
        </p>
      </div>
    </div>
  );
}

function NoFinalizedPRsState() {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <div className="space-y-3 text-center">
        <h2 className="text-lg font-medium text-foreground">
          No finalized PRs yet
        </h2>
        <p className="text-sm text-muted-foreground">
          Metrics appear once your pull requests are merged or closed.
        </p>
      </div>
    </div>
  );
}

async function MyMetricsBody({
  metricsPromise,
  slug,
  range,
}: {
  metricsPromise: Promise<AggregateMetrics>;
  slug: string;
  range: Range;
}) {
  const data = await metricsPromise;
  if (data.totalPRs === 0) return <NoFinalizedPRsState />;

  const m = (metricSlug: string) => data.metrics[metricSlug]?.current ?? null;
  const prior = (metricSlug: string) => data.metrics[metricSlug]?.prior ?? null;
  const spark = (metricSlug: string) => data.metrics[metricSlug]?.sparkline;

  const metricHref = (metricSlug: string) =>
    `/${slug}/me/metrics/${metricSlug}`;
  const tip = (metricSlug: string) => {
    const def = METRIC_INFO[metricSlug];
    return def ? { tooltip: def.tooltip } : {};
  };

  return (
    <>
      {/* Output Quality */}
      <div className="mb-8">
        <SectionDivider label="Output Quality" />
        <div className="grid grid-cols-3 gap-3">
          <MetricCard
            label="Avg Post-Open Commits"
            value={fmt(m("post-open-commits"))}
            delta={fmtDelta(m("post-open-commits"), prior("post-open-commits"), (n) => fmt(n), range)}
            sparkline={spark("post-open-commits")}
            href={metricHref("post-open-commits")}
            {...tip("post-open-commits")}
          />
          <MetricCard
            label="CI Success Rate"
            value={fmtPct(m("ci-success-rate"))}
            delta={fmtDelta(m("ci-success-rate"), prior("ci-success-rate"), fmtPct, range)}
            sparkline={spark("ci-success-rate")}
            href={metricHref("ci-success-rate")}
            {...tip("ci-success-rate")}
          />
          <MetricCard
            label="Avg Line Revisit Rate"
            value={fmt(m("line-revisit-rate"), 2)}
            delta={fmtDelta(m("line-revisit-rate"), prior("line-revisit-rate"), (n) => fmt(n, 2), range)}
            sparkline={spark("line-revisit-rate")}
            href={metricHref("line-revisit-rate")}
            {...tip("line-revisit-rate")}
          />
        </div>
      </div>

      {/* Prompt Efficiency */}
      <div className="mb-8">
        <SectionDivider label="Prompt Efficiency" />
        <div className="grid grid-cols-3 gap-3">
          <MetricCard
            label="Avg Iteration Depth"
            value={fmt(m("iteration-depth"), 0)}
            delta={fmtDelta(m("iteration-depth"), prior("iteration-depth"), (n) => fmt(n, 0), range)}
            sparkline={spark("iteration-depth")}
            href={metricHref("iteration-depth")}
            {...tip("iteration-depth")}
          />
          <MetricCard
            label="Avg Token Cost"
            value={fmtCost(m("token-cost-per-pr"))}
            delta={fmtDelta(m("token-cost-per-pr"), prior("token-cost-per-pr"), fmtCost, range)}
            sparkline={spark("token-cost-per-pr")}
            href={metricHref("token-cost-per-pr")}
            {...tip("token-cost-per-pr")}
          />
          <MetricCard
            label="Avg Cache Hit Rate"
            value={fmtPct(m("cache-hit-rate"))}
            delta={fmtDelta(m("cache-hit-rate"), prior("cache-hit-rate"), fmtPct, range)}
            sparkline={spark("cache-hit-rate")}
            href={metricHref("cache-hit-rate")}
            {...tip("cache-hit-rate")}
          />
        </div>
      </div>

      {/* Agent Behavior */}
      <div className="mb-8">
        <SectionDivider label="Agent Behavior" />
        <div className="grid grid-cols-3 gap-3">
          <MetricCard
            label="Avg Sidechain Rate"
            value={fmtPct(m("sidechain-rate"))}
            delta={fmtDelta(m("sidechain-rate"), prior("sidechain-rate"), fmtPct, range)}
            sparkline={spark("sidechain-rate")}
            href={metricHref("sidechain-rate")}
            {...tip("sidechain-rate")}
          />
          <MetricCard
            label="Avg Re-Read Rate"
            value={fmt(m("re-read-rate"), 2)}
            delta={fmtDelta(m("re-read-rate"), prior("re-read-rate"), (n) => fmt(n, 2), range)}
            sparkline={spark("re-read-rate")}
            href={metricHref("re-read-rate")}
            {...tip("re-read-rate")}
          />
          <MetricCard
            label="Avg Autonomy Score"
            value={fmt(m("autonomy-score"), 1)}
            delta={fmtDelta(m("autonomy-score"), prior("autonomy-score"), (n) => fmt(n, 1), range)}
            sparkline={spark("autonomy-score")}
            href={metricHref("autonomy-score")}
            {...tip("autonomy-score")}
          />
        </div>
      </div>
    </>
  );
}
