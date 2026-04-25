export const runtime = "edge";

import Link from "next/link";
import { Suspense } from "react";
import { getAggregateMetricsAsync, listReposAsync, listTeamsAsync } from "@/lib/db";
import type { AggregateMetrics, Team } from "@/lib/db";
import { RepoFilter } from "@/components/repo-filter";
import { ScopeSelector, type ScopeTeam } from "@/components/scope-selector";
import { Skeleton, SkeletonMetricCategory } from "@/components/skeleton";
import { SectionErrorBoundary } from "@/components/section-error-boundary";
import { RangeToggle, type Range } from "@/components/range-toggle";
import { OverviewMetricsGrid } from "@/components/overview-metrics-grid";

const VALID_RANGES: Range[] = ["7d", "30d", "90d"];

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
          <OverviewSubtitle
            reposPromise={reposPromise}
            repoId={repoId}
            metricsPromise={metricsPromise}
            teamsPromise={teamsPromise}
            slug={slug}
            range={range}
          />
        </Suspense>
      </div>

      <SectionErrorBoundary>
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
  platform: "github" | "gitlab";
  platform_owner: string | null;
  platform_repo: string | null;
};

function teamsToScopeTeams(teams: Team[]): ScopeTeam[] {
  const lookup = Object.fromEntries(teams.map((t) => [t.slug, t]));
  return teams.map((t) => ({
    slug: t.slug,
    name: t.name,
    parentName: t.parent_team_slug ? lookup[t.parent_team_slug]?.name ?? null : null,
    memberCount: t.member_count,
  }));
}

// Subtitle depends on both promises. If the metrics fetch fails we still
// render the repo filter (no PR count) rather than crashing the whole header.
async function OverviewSubtitle({
  reposPromise,
  repoId,
  metricsPromise,
  teamsPromise,
  slug,
  range,
}: {
  reposPromise: Promise<RepoLite[]>;
  repoId: number | undefined;
  metricsPromise: Promise<AggregateMetrics>;
  teamsPromise: Promise<Team[]>;
  slug: string;
  range: Range;
}) {
  const [allRepos, teams] = await Promise.all([reposPromise, teamsPromise]);
  const repos = allRepos.filter(
    (r): r is RepoLite & { platform_owner: string; platform_repo: string } =>
      r.platform_owner !== null && r.platform_repo !== null,
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
      <ScopeSelector
        current="everyone"
        teams={teamsToScopeTeams(teams)}
        basePath={`/${slug}`}
      />
      {" "}&middot;{" "}
      <RepoFilter repos={repos} current={repoId} />
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
          Metrics appear once session data is pushed or pull requests are merged
          or closed. Run <code className="text-primary">ax push</code> to send
          session data, or check back after recent PR activity.
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
  if (data.totalPRs === 0 && data.totalSessions === 0) return <NoDataState />;

  const query = new URLSearchParams();
  if (repoId) query.set("repo", String(repoId));
  query.set("range", range);
  const qs = query.toString();

  return (
    <OverviewMetricsGrid
      metrics={data.metrics}
      range={range}
      metricHref={(metricSlug) => `/${slug}/metrics/${metricSlug}?${qs}`}
    />
  );
}
