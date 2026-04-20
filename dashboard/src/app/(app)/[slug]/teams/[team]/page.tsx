export const runtime = "edge";

import Link from "next/link";
import { Suspense } from "react";
import { Users, GitBranch } from "lucide-react";
import { getTeamAsync, getTeamMetricsAsync } from "@/lib/db";
import type { AggregateMetrics, SparklinePoint, TeamDetail } from "@/lib/db";
import { METRIC_DEFS } from "@/lib/metric-defs";
import { Skeleton, SkeletonMetricCategory } from "@/components/skeleton";
import { SectionErrorBoundary } from "@/components/section-error-boundary";
import { SectionDivider } from "@/components/section-divider";
import { Sparkline } from "@/components/sparkline";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
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

export default async function TeamOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; team: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { slug, team: teamSlug } = await params;
  const { range: rangeParam } = await searchParams;
  const range: Range = VALID_RANGES.includes(rangeParam as Range)
    ? (rangeParam as Range)
    : "30d";

  const teamPromise = getTeamAsync(slug, teamSlug);
  const metricsPromise = getTeamMetricsAsync(slug, teamSlug, range);

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-baseline justify-between">
          <Suspense fallback={<Skeleton className="h-7 w-48" />}>
            <TeamTitle teamPromise={teamPromise} slug={slug} />
          </Suspense>
          <RangeToggle current={range} />
        </div>
        <Suspense fallback={<Skeleton className="mt-1 h-4 w-64" />}>
          <TeamSubtitle
            teamPromise={teamPromise}
            metricsPromise={metricsPromise}
            range={range}
          />
        </Suspense>
      </div>

      <SectionErrorBoundary fallback={<NoDataState />}>
        <Suspense fallback={<OverviewMetricsSkeleton />}>
          <TeamMetricsBody
            metricsPromise={metricsPromise}
            slug={slug}
            teamSlug={teamSlug}
            range={range}
          />
        </Suspense>
      </SectionErrorBoundary>

      <div className="mt-6">
        <Link
          href={`/${slug}/teams/${teamSlug}/prs`}
          className="text-[13px] text-primary transition-colors hover:underline"
        >
          View all pull requests →
        </Link>
      </div>

      <SectionErrorBoundary fallback={null}>
        <Suspense fallback={null}>
          <TeamMembersSection teamPromise={teamPromise} />
        </Suspense>
      </SectionErrorBoundary>

      <SectionErrorBoundary fallback={null}>
        <Suspense fallback={null}>
          <ChildTeamsSection teamPromise={teamPromise} slug={slug} />
        </Suspense>
      </SectionErrorBoundary>
    </div>
  );
}

async function TeamTitle({
  teamPromise,
  slug,
}: {
  teamPromise: Promise<TeamDetail>;
  slug: string;
}) {
  const team = await teamPromise;
  return (
    <div>
      {team.parent_team_slug && (
        <Link
          href={`/${slug}/teams/${team.parent_team_slug}`}
          className="mb-1 block text-[12px] text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Parent team
        </Link>
      )}
      <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">
        {team.name}
      </h1>
    </div>
  );
}

async function TeamSubtitle({
  teamPromise,
  metricsPromise,
  range,
}: {
  teamPromise: Promise<TeamDetail>;
  metricsPromise: Promise<AggregateMetrics>;
  range: Range;
}) {
  const team = await teamPromise;
  let metrics: AggregateMetrics | null = null;
  try {
    metrics = await metricsPromise;
  } catch {
    // Metrics body's error boundary will show "No data yet"
  }
  return (
    <p className="mt-1 text-[13px] text-muted-foreground">
      <span className="font-medium text-foreground">
        {team.member_count} member{team.member_count !== 1 && "s"}
      </span>
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
          Metrics appear once team members have finalized pull requests.
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

async function TeamMetricsBody({
  metricsPromise,
  slug,
  teamSlug,
  range,
}: {
  metricsPromise: Promise<AggregateMetrics>;
  slug: string;
  teamSlug: string;
  range: Range;
}) {
  const data = await metricsPromise;
  if (data.totalPRs === 0) return <NoFinalizedPRsState />;

  const m = (metricSlug: string) => data.metrics[metricSlug]?.current ?? null;
  const prior = (metricSlug: string) => data.metrics[metricSlug]?.prior ?? null;
  const spark = (metricSlug: string) => data.metrics[metricSlug]?.sparkline;

  const metricHref = (metricSlug: string) =>
    `/${slug}/teams/${teamSlug}/metrics/${metricSlug}`;
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

async function TeamMembersSection({
  teamPromise,
}: {
  teamPromise: Promise<TeamDetail>;
}) {
  const team = await teamPromise;
  if (team.members.length === 0) return null;

  return (
    <div className="mt-8">
      <SectionDivider label="Members" />
      <div className="flex flex-wrap gap-2">
        {team.members.map((member) => (
          <ClientTooltip
            key={member.id}
            content={member.user.display_name || member.user.github_username}
          >
            <Avatar className="size-8 border border-border">
              {member.user.avatar_url ? (
                <AvatarImage
                  src={member.user.avatar_url}
                  alt={member.user.github_username}
                />
              ) : null}
              <AvatarFallback className="text-[11px]">
                {(member.user.display_name || member.user.github_username)
                  .slice(0, 2)
                  .toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </ClientTooltip>
        ))}
      </div>
    </div>
  );
}

async function ChildTeamsSection({
  teamPromise,
  slug,
}: {
  teamPromise: Promise<TeamDetail>;
  slug: string;
}) {
  const team = await teamPromise;
  if (team.child_teams.length === 0) return null;

  return (
    <div className="mt-8">
      <SectionDivider label="Sub-Teams" />
      <div className="grid grid-cols-3 gap-3">
        {team.child_teams.map((child) => (
          <Link
            key={child.id}
            href={`/${slug}/teams/${child.slug}`}
            className="block"
          >
            <Card className="gap-0 p-5 transition-colors hover:border-primary/30 hover:bg-accent/40 cursor-pointer">
              <CardContent className="p-0">
                <div className="mb-2 text-[15px] font-medium text-foreground">
                  {child.name}
                </div>
                <div className="flex items-center gap-4 text-[12px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Users className="size-3.5" aria-hidden />
                    {child.member_count} member{child.member_count !== 1 && "s"}
                  </span>
                  {child.child_team_count > 0 && (
                    <span className="inline-flex items-center gap-1.5">
                      <GitBranch className="size-3.5" aria-hidden />
                      {child.child_team_count} sub-team{child.child_team_count !== 1 && "s"}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
