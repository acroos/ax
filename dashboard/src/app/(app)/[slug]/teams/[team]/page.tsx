export const runtime = "edge";

import Link from "next/link";
import { Suspense } from "react";
import { Users, GitBranch } from "lucide-react";
import { getTeamAsync, getTeamMetricsAsync } from "@/lib/db";
import type { AggregateMetrics, TeamDetail } from "@/lib/db";
import { Skeleton, SkeletonMetricCategory } from "@/components/skeleton";
import { SectionErrorBoundary } from "@/components/section-error-boundary";
import { SectionDivider } from "@/components/section-divider";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ClientTooltip } from "@/components/client-tooltip";
import { RangeToggle, type Range } from "@/components/range-toggle";
import { OverviewMetricsGrid } from "@/components/overview-metrics-grid";

const VALID_RANGES: Range[] = ["7d", "30d", "90d"];

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

      <SectionErrorBoundary>
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

      <SectionErrorBoundary>
        <Suspense fallback={null}>
          <TeamMembersSection teamPromise={teamPromise} />
        </Suspense>
      </SectionErrorBoundary>

      <SectionErrorBoundary>
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
          &middot; {metrics.totalSessions} session
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
          Metrics appear once session data is pushed or pull requests are merged or closed.
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
  if (data.totalPRs === 0 && data.totalSessions === 0) return <NoDataState />;

  return (
    <OverviewMetricsGrid
      metrics={data.metrics}
      range={range}
      metricHref={(metricSlug) => `/${slug}/teams/${teamSlug}/metrics/${metricSlug}?range=${range}`}
    />
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
