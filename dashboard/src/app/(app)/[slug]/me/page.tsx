export const runtime = "edge";

import Link from "next/link";
import { Suspense } from "react";
import { getMyMetricsAsync, listTeamsAsync } from "@/lib/db";
import type { AgentType, AggregateMetrics, Team } from "@/lib/db";
import { AgentTypeFilter } from "@/components/agent-type-filter";
import { ScopeSelector, type ScopeTeam } from "@/components/scope-selector";
import { Skeleton, SkeletonMetricCategory } from "@/components/skeleton";
import { SectionErrorBoundary } from "@/components/section-error-boundary";
import { OverviewMetricsGrid } from "@/components/overview-metrics-grid";
import { RangeToggle, type Range } from "@/components/range-toggle";

const VALID_RANGES: Range[] = ["7d", "30d", "90d"];

export default async function MyOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ range?: string; agent_type?: string }>;
}) {
  const { slug } = await params;
  const { range: rangeParam, agent_type: agentTypeParam } = await searchParams;
  const range: Range = VALID_RANGES.includes(rangeParam as Range)
    ? (rangeParam as Range)
    : "30d";
  const agentType = parseAgentType(agentTypeParam);

  const metricsPromise = getMyMetricsAsync(slug, range, agentType);
  const teamsPromise = listTeamsAsync(slug).catch(() => [] as Team[]);

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-baseline justify-between">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">
            Metrics
          </h1>
          <RangeToggle current={range} />
        </div>
        <Suspense fallback={<Skeleton className="mt-1 h-4 w-64" />}>
          <MySubtitle
            metricsPromise={metricsPromise}
            teamsPromise={teamsPromise}
            slug={slug}
            range={range}
            agentType={agentType}
          />
        </Suspense>
      </div>

      <SectionErrorBoundary>
        <Suspense fallback={<OverviewMetricsSkeleton />}>
          <MyMetricsBody
            metricsPromise={metricsPromise}
            slug={slug}
            range={range}
            agentType={agentType}
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

function teamsToScopeTeams(teams: Team[]): ScopeTeam[] {
  const lookup = Object.fromEntries(teams.map((t) => [t.slug, t]));
  return teams.map((t) => ({
    slug: t.slug,
    name: t.name,
    parentName: t.parent_team_slug ? lookup[t.parent_team_slug]?.name ?? null : null,
    memberCount: t.member_count,
  }));
}

function parseAgentType(value?: string): AgentType | undefined {
  return value === "claude_code" || value === "copilot_cli" ? value : undefined;
}

async function MySubtitle({
  metricsPromise,
  teamsPromise,
  slug,
  range,
  agentType,
}: {
  metricsPromise: Promise<AggregateMetrics>;
  teamsPromise: Promise<Team[]>;
  slug: string;
  range: Range;
  agentType?: AgentType;
}) {
  const teams = await teamsPromise;
  let metrics: AggregateMetrics | null = null;
  try {
    metrics = await metricsPromise;
  } catch {
    // Metrics body's error boundary will show "No data yet"
  }
  return (
    <p className="mt-1 text-[13px] text-muted-foreground">
      <ScopeSelector
        current="me"
        teams={teamsToScopeTeams(teams)}
        basePath={`/${slug}`}
      />
      {" "}&middot;{" "}
      <AgentTypeFilter current={agentType} />
      {metrics !== null && (
        <>
          {" "}&middot; {metrics.totalSessions} session
          {metrics.totalSessions !== 1 && "s"}
          {metrics.totalPRs > 0 && (
            <>, {metrics.totalPRs} finalized PR
            {metrics.totalPRs !== 1 && "s"}</>
          )} in past {range}
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
        <h2 className="text-lg font-medium text-foreground">
          No data yet
        </h2>
        <p className="text-sm text-muted-foreground">
          Metrics appear once you push session data or your pull requests are merged or closed.
        </p>
      </div>
    </div>
  );
}

async function MyMetricsBody({
  metricsPromise,
  slug,
  range,
  agentType,
}: {
  metricsPromise: Promise<AggregateMetrics>;
  slug: string;
  range: Range;
  agentType?: AgentType;
}) {
  const data = await metricsPromise;
  if (data.totalPRs === 0 && data.totalSessions === 0) return <NoDataState />;

  return (
    <OverviewMetricsGrid
      metrics={data.metrics}
      range={range}
      metricHref={(metricSlug) => `/${slug}/me/metrics/${metricSlug}?${new URLSearchParams({ range, ...(agentType ? { agent_type: agentType } : {}) }).toString()}`}
    />
  );
}
