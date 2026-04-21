export const runtime = "edge";

import Link from "next/link";
import { Suspense, useId } from "react";
import { getAggregateMetricsAsync, listReposAsync } from "@/lib/db";
import type { AggregateMetrics, SparklinePoint } from "@/lib/db";
import { METRIC_DEFS } from "@/lib/metric-defs";
import { RepoFilter } from "@/components/repo-filter";
import { Skeleton, SkeletonMetricCategory } from "@/components/skeleton";
import { SectionErrorBoundary } from "@/components/section-error-boundary";
import { SectionDivider } from "@/components/section-divider";
import { Sparkline } from "@/components/sparkline";
import { Card, CardContent } from "@/components/ui/card";
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
  const descriptionId = useId();

  const cardContent = (
    <CardContent className="relative p-0">
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
          <Sparkline data={sparkline} className="h-full w-full" label={label} />
        )}
      </div>
      {tooltip && (
        <div
          id={descriptionId}
          className="pointer-events-none absolute -inset-x-5 -bottom-5 rounded-b-xl bg-gradient-to-t from-card from-75% to-transparent px-5 pb-5 pt-8 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
        >
          <p className="text-[12px] leading-relaxed text-muted-foreground/70">
            {tooltip}
          </p>
        </div>
      )}
    </CardContent>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="group block"
        aria-describedby={tooltip ? descriptionId : undefined}
      >
        <Card className="gap-0 p-5 transition-colors hover:border-primary/30 hover:bg-accent/40 cursor-pointer">
          {cardContent}
        </Card>
      </Link>
    );
  }

  return (
    <Card
      className="group gap-0 p-5 transition-colors"
      tabIndex={0}
      aria-describedby={tooltip ? descriptionId : undefined}
    >
      {cardContent}
    </Card>
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

// Page renders the shell synchronously (title, view-all link) and streams
// the subtitle and metrics body via Suspense. Both promises are kicked off
// in parallel at the top so they fetch concurrently instead of sequentially.
export default async function OrgOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ repo?: string; range?: string }>;
}) {
  const { slug } = await params;
  const { repo, range: rangeParam } = await searchParams;
  const repoId = repo ? parseInt(repo, 10) : undefined;
  const range: Range = VALID_RANGES.includes(rangeParam as Range)
    ? (rangeParam as Range)
    : "30d";

  // Kick off all fetches in parallel — do NOT await here. Each child
  // component awaits what it needs; React dedupes multiple awaits on the
  // same promise into a single fetch.
  const metricsPromise = getAggregateMetricsAsync(repoId, slug, range);
  const reposPromise = listReposAsync(slug).catch(() => []);

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-baseline justify-between">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">
            Overview
          </h1>
          <RangeToggle current={range} />
        </div>
        <Suspense fallback={<Skeleton className="mt-1 h-4 w-64" />}>
          <OverviewSubtitle
            reposPromise={reposPromise}
            repoId={repoId}
            metricsPromise={metricsPromise}
            range={range}
          />
        </Suspense>
      </div>

      <SectionErrorBoundary fallback={<NoDataState />}>
        <Suspense fallback={<OverviewMetricsSkeleton />}>
          <OverviewMetricsBody
            promise={metricsPromise}
            slug={slug}
            repoId={repoId}
            range={range}
          />
        </Suspense>
      </SectionErrorBoundary>

      <div className="mt-6">
        <Link
          href={`/${slug}/prs`}
          className="text-[13px] text-primary transition-colors hover:underline"
        >
          View all pull requests →
        </Link>
      </div>
    </div>
  );
}

type RepoLite = {
  id: number;
  github_owner: string | null;
  github_repo: string | null;
};

// Subtitle depends on both promises. If the metrics fetch fails we still
// render the repo filter (no PR count) rather than crashing the whole header.
async function OverviewSubtitle({
  reposPromise,
  repoId,
  metricsPromise,
  range,
}: {
  reposPromise: Promise<RepoLite[]>;
  repoId: number | undefined;
  metricsPromise: Promise<AggregateMetrics>;
  range: Range;
}) {
  const allRepos = await reposPromise;
  const repos = allRepos.filter(
    (r): r is RepoLite & { github_owner: string; github_repo: string } =>
      r.github_owner !== null && r.github_repo !== null,
  );
  let metrics: AggregateMetrics | null = null;
  try {
    metrics = await metricsPromise;
  } catch {
    // Metrics body's error boundary will show "No data yet"; leave the
    // subtitle reading just the repo filter.
  }
  return (
    <p className="mt-1 text-[13px] text-muted-foreground">
      <RepoFilter repos={repos} current={repoId} />
      {metrics !== null && (
        <>
          {" "}
          &middot; {metrics.totalPRs} finalized PR
          {metrics.totalPRs !== 1 && "s"} in past {range}
        </>
      )}
    </p>
  );
}

// Mirrors the real layout — three category grids.
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
      <div className="max-w-sm space-y-4 text-center">
        <h2 className="font-serif text-lg font-medium text-foreground">
          No data yet
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Connect a repository to start tracking metrics. Once pull requests are
          merged or closed, your dashboard will come to life.
        </p>
        <Link
          href="/docs"
          className="inline-block text-sm text-primary transition-colors hover:underline"
        >
          Explore the metrics while you wait &rarr;
        </Link>
      </div>
    </div>
  );
}

function NoFinalizedPRsState() {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <div className="max-w-sm space-y-4 text-center">
        <h2 className="font-serif text-lg font-medium text-foreground">
          No finalized PRs yet
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Metrics appear once pull requests are merged or closed. Check back in a
          few minutes if you have recent PR activity.
        </p>
        <Link
          href="/docs"
          className="inline-block text-sm text-primary transition-colors hover:underline"
        >
          Learn about the metrics while you wait &rarr;
        </Link>
      </div>
    </div>
  );
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

async function OverviewMetricsBody({
  promise,
  slug,
  repoId,
  range,
}: {
  promise: Promise<AggregateMetrics>;
  slug: string;
  repoId: number | undefined;
  range: Range;
}) {
  const data = await promise;
  if (data.totalPRs === 0) return <NoFinalizedPRsState />;

  const m = (metricSlug: string) => data.metrics[metricSlug]?.current ?? null;
  const prior = (metricSlug: string) => data.metrics[metricSlug]?.prior ?? null;
  const spark = (metricSlug: string) => data.metrics[metricSlug]?.sparkline;

  const repoQuery = repoId ? `?repo=${repoId}` : "";
  const metricHref = (metricSlug: string) =>
    `/${slug}/metrics/${metricSlug}${repoQuery}`;
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
