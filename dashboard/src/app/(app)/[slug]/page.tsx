import Link from "next/link";
import { Suspense } from "react";
import { getAggregateMetricsAsync, listReposAsync } from "@/lib/db";
import type { AggregateMetrics, SparklinePoint } from "@/lib/db";
import { METRIC_DEFS } from "@/lib/metric-defs";
import { Skeleton, SkeletonMetricCategory } from "@/components/skeleton";
import { SectionErrorBoundary } from "@/components/section-error-boundary";
import { SectionDivider } from "@/components/section-divider";
import { Sparkline } from "@/components/sparkline";
import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const METRIC_INFO = Object.fromEntries(METRIC_DEFS.map((d) => [d.slug, d]));

function MetricCard({
  label,
  value,
  detail,
  tooltip,
  goodRange,
  href,
  surface = "default",
  delta,
  sparkline,
}: {
  label: string;
  value: string;
  detail?: string;
  tooltip?: string;
  goodRange?: string;
  href?: string;
  surface?: "default" | "secondary";
  delta?: string;
  sparkline?: SparklinePoint[];
}) {
  const card = (
    <Card
      className={`gap-0 p-5 transition-colors ${
        surface === "secondary" ? "bg-secondary" : ""
      } ${
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
          <div className="text-[12px] text-muted-foreground">{delta}</div>
        )}
        {detail && (
          <div className="text-[12px] text-muted-foreground">{detail}</div>
        )}
        {sparkline && sparkline.length > 0 && (
          <Sparkline data={sparkline} className="mt-3 h-6 w-full" />
        )}
      </CardContent>
    </Card>
  );

  const tipped = tooltip ? (
    <Tooltip>
      <TooltipTrigger asChild>{card}</TooltipTrigger>
      <TooltipContent side="top" className="max-w-[280px]">
        <p>{tooltip}</p>
        {goodRange && (
          <p className="mt-1 text-[11px] opacity-80">{goodRange}</p>
        )}
      </TooltipContent>
    </Tooltip>
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

// Page renders the shell synchronously (title, view-all link) and streams
// the subtitle and metrics body via Suspense. Both promises are kicked off
// in parallel at the top so they fetch concurrently instead of sequentially.
export default async function OrgOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ repo?: string }>;
}) {
  const { slug } = await params;
  const { repo } = await searchParams;
  const repoId = repo ? parseInt(repo, 10) : undefined;

  // Kick off both fetches in parallel — do NOT await here. Each child
  // component awaits what it needs; React dedupes multiple awaits on the
  // same promise into a single fetch.
  const metricsPromise = getAggregateMetricsAsync(repoId, slug);
  const repoLabelPromise = resolveRepoLabel(slug, repoId);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">
          Overview
        </h1>
        <Suspense fallback={<Skeleton className="mt-1 h-4 w-64" />}>
          <OverviewSubtitle
            repoLabelPromise={repoLabelPromise}
            metricsPromise={metricsPromise}
          />
        </Suspense>
      </div>

      <SectionErrorBoundary fallback={<NoDataState />}>
        <Suspense fallback={<OverviewMetricsSkeleton />}>
          <OverviewMetricsBody
            promise={metricsPromise}
            slug={slug}
            repoId={repoId}
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

async function resolveRepoLabel(
  slug: string,
  repoId: number | undefined,
): Promise<string> {
  if (!repoId) return "All Repositories";
  try {
    const repos = await listReposAsync(slug);
    const match = repos.find((r) => r.id === repoId);
    if (match) return `${match.github_owner}/${match.github_repo}`;
    return "All Repositories";
  } catch {
    return "All Repositories";
  }
}

// Subtitle depends on both promises. If the metrics fetch fails we still
// render the repo label (no PR count) rather than crashing the whole header.
async function OverviewSubtitle({
  repoLabelPromise,
  metricsPromise,
}: {
  repoLabelPromise: Promise<string>;
  metricsPromise: Promise<AggregateMetrics>;
}) {
  const repoLabel = await repoLabelPromise;
  let metrics: AggregateMetrics | null = null;
  try {
    metrics = await metricsPromise;
  } catch {
    // Metrics body's error boundary will show "No data yet"; leave the
    // subtitle reading just the repo label.
  }
  return (
    <p className="mt-1 text-[13px] text-muted-foreground">
      <span className="font-medium text-foreground">{repoLabel}</span>
      {metrics !== null && (
        <>
          {" "}
          &middot; {metrics.totalPRs} finalized PR
          {metrics.totalPRs !== 1 && "s"}
        </>
      )}
    </p>
  );
}

// Mirrors the real layout — three category grids.
function OverviewMetricsSkeleton() {
  return (
    <>
      <SkeletonMetricCategory count={4} />
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
          Connect a repository to start tracking metrics.
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
          Metrics appear once pull requests are merged or closed.
        </p>
      </div>
    </div>
  );
}

function fmtDelta(
  current: number | null,
  prior: number | null,
  formatter: (n: number | null) => string
): string | undefined {
  if (current === null || prior === null) return undefined;
  const diff = current - prior;
  if (Math.abs(diff) < 0.005) return undefined;
  const arrow = diff > 0 ? "\u2191" : "\u2193";
  return `${arrow} ${formatter(Math.abs(diff))} wk/wk`;
}

async function OverviewMetricsBody({
  promise,
  slug,
  repoId,
}: {
  promise: Promise<AggregateMetrics>;
  slug: string;
  repoId: number | undefined;
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
    return def ? { tooltip: def.tooltip, goodRange: def.goodRange } : {};
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
            delta={fmtDelta(m("post-open-commits"), prior("post-open-commits"), (n) => fmt(n))}
            sparkline={spark("post-open-commits")}
            detail="Lower is better"
            href={metricHref("post-open-commits")}
            surface="secondary"
            {...tip("post-open-commits")}
          />
          <MetricCard
            label="CI Success Rate"
            value={fmtPct(m("ci-success-rate"))}
            delta={fmtDelta(m("ci-success-rate"), prior("ci-success-rate"), fmtPct)}
            sparkline={spark("ci-success-rate")}
            href={metricHref("ci-success-rate")}
            {...tip("ci-success-rate")}
          />
          <MetricCard
            label="Avg Line Revisit Rate"
            value={fmt(m("line-revisit-rate"), 2)}
            delta={fmtDelta(m("line-revisit-rate"), prior("line-revisit-rate"), (n) => fmt(n, 2))}
            sparkline={spark("line-revisit-rate")}
            detail="Cross-PR file overlap"
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
            delta={fmtDelta(m("iteration-depth"), prior("iteration-depth"), (n) => fmt(n, 0))}
            sparkline={spark("iteration-depth")}
            detail="Human-agent turn pairs"
            href={metricHref("iteration-depth")}
            surface="secondary"
            {...tip("iteration-depth")}
          />
          <MetricCard
            label="Avg Token Cost"
            value={fmtCost(m("token-cost-per-pr"))}
            delta={fmtDelta(m("token-cost-per-pr"), prior("token-cost-per-pr"), fmtCost)}
            sparkline={spark("token-cost-per-pr")}
            detail={data.sessionDataCount > 0 ? `${data.sessionDataCount} of ${data.totalPRs} PRs with session data` : undefined}
            href={metricHref("token-cost-per-pr")}
            {...tip("token-cost-per-pr")}
          />
          <MetricCard
            label="Avg Cache Hit Rate"
            value={fmtPct(m("cache-hit-rate"))}
            delta={fmtDelta(m("cache-hit-rate"), prior("cache-hit-rate"), fmtPct)}
            sparkline={spark("cache-hit-rate")}
            detail="Prompt cache utilization"
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
            delta={fmtDelta(m("sidechain-rate"), prior("sidechain-rate"), fmtPct)}
            sparkline={spark("sidechain-rate")}
            detail="Dead-end reasoning paths"
            href={metricHref("sidechain-rate")}
            surface="secondary"
            {...tip("sidechain-rate")}
          />
          <MetricCard
            label="Avg Re-Read Rate"
            value={fmt(m("re-read-rate"), 2)}
            delta={fmtDelta(m("re-read-rate"), prior("re-read-rate"), (n) => fmt(n, 2))}
            sparkline={spark("re-read-rate")}
            detail="File read redundancy"
            href={metricHref("re-read-rate")}
            {...tip("re-read-rate")}
          />
          <MetricCard
            label="Avg Autonomy Score"
            value={fmt(m("autonomy-score"), 1)}
            delta={fmtDelta(m("autonomy-score"), prior("autonomy-score"), (n) => fmt(n, 1))}
            sparkline={spark("autonomy-score")}
            detail="Agent independence ratio"
            href={metricHref("autonomy-score")}
            {...tip("autonomy-score")}
          />
        </div>
      </div>
    </>
  );
}
