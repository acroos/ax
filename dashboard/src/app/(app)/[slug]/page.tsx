import Link from "next/link";
import { Suspense } from "react";
import { getAggregateMetricsAsync, listReposAsync } from "@/lib/db";
import type { AggregateMetrics } from "@/lib/db";
import { METRIC_DEFS } from "@/lib/metric-defs";
import { Skeleton, SkeletonMetricCategory } from "@/components/skeleton";
import { SectionErrorBoundary } from "@/components/section-error-boundary";
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
}: {
  label: string;
  value: string;
  detail?: string;
  tooltip?: string;
  goodRange?: string;
  href?: string;
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
        <div className="mb-1 font-mono text-[28px] font-medium leading-none tracking-tight text-foreground">
          {value}
        </div>
        {detail && (
          <div className="text-[12px] text-muted-foreground">{detail}</div>
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

async function OverviewMetricsBody({
  promise,
  slug,
  repoId,
}: {
  promise: Promise<AggregateMetrics>;
  slug: string;
  repoId: number | undefined;
}) {
  const metrics = await promise;
  if (metrics.totalPRs === 0) return <NoFinalizedPRsState />;

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
        <h2 className="mb-3 px-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Output Quality
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <MetricCard
            label="Avg Post-Open Commits"
            value={fmt(metrics.avgPostOpenCommits)}
            detail="Lower is better"
            href={metricHref("post-open-commits")}
            {...tip("post-open-commits")}
          />
          <MetricCard
            label="CI Success Rate"
            value={fmtPct(metrics.ciSuccessRate)}
            href={metricHref("ci-success-rate")}
            {...tip("ci-success-rate")}
          />
          <MetricCard
            label="Avg Line Revisit Rate"
            value={fmt(metrics.avgLineRevisitRate, 2)}
            detail="Cross-PR file overlap"
            href={metricHref("line-revisit-rate")}
            {...tip("line-revisit-rate")}
          />
        </div>
      </div>

      {/* Prompt Efficiency */}
      <div className="mb-8">
        <h2 className="mb-3 px-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Prompt Efficiency
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <MetricCard
            label="Avg Iteration Depth"
            value={fmt(metrics.avgIterationDepth, 0)}
            detail="Human-agent turn pairs"
            href={metricHref("iteration-depth")}
            {...tip("iteration-depth")}
          />
          <MetricCard
            label="Avg Token Cost"
            value={fmtCost(metrics.avgTokenCost)}
            detail={
              metrics.sessionDataCount > 0
                ? `${metrics.sessionDataCount} of ${metrics.totalPRs} PRs with session data`
                : undefined
            }
            href={metricHref("token-cost-per-pr")}
            {...tip("token-cost-per-pr")}
          />
          <MetricCard
            label="Avg Cache Hit Rate"
            value={fmtPct(metrics.avgCacheHitRate)}
            detail="Prompt cache utilization"
            href={metricHref("cache-hit-rate")}
            {...tip("cache-hit-rate")}
          />
        </div>
      </div>

      {/* Agent Behavior */}
      <div className="mb-8">
        <h2 className="mb-3 px-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Agent Behavior
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <MetricCard
            label="Avg Sidechain Rate"
            value={fmtPct(metrics.avgSidechainRate)}
            detail="Dead-end reasoning paths"
            href={metricHref("sidechain-rate")}
            {...tip("sidechain-rate")}
          />
          <MetricCard
            label="Avg Re-Read Rate"
            value={fmt(metrics.avgReReadRate, 2)}
            detail="File read redundancy"
            href={metricHref("re-read-rate")}
            {...tip("re-read-rate")}
          />
          <MetricCard
            label="Avg Autonomy Score"
            value={fmt(metrics.avgAutonomyScore, 1)}
            detail="Agent independence ratio"
            href={metricHref("autonomy-score")}
            {...tip("autonomy-score")}
          />
        </div>
      </div>
    </>
  );
}
