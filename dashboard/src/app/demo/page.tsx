import Link from "next/link";
import {
  getMockAggregatesForDays,
  getMockAggregatesForRepo,
  MOCK_REPOS,
  MOCK_TEAMS,
} from "@/lib/mock/data";
import { RepoFilter } from "@/components/repo-filter";
import { ScopeSelector, type ScopeTeam } from "@/components/scope-selector";
import { RangeToggle, type Range } from "@/components/range-toggle";
import { OverviewMetricsGrid } from "@/components/overview-metrics-grid";

const DEMO_REPOS = MOCK_REPOS.filter(
  (r): r is typeof r & { platform_owner: string; platform_repo: string } =>
    r.platform_owner !== null && r.platform_repo !== null,
);

const SCOPE_TEAMS: ScopeTeam[] = MOCK_TEAMS.map((t) => ({
  slug: t.slug,
  name: t.name,
  parentName: t.parent_team_slug
    ? MOCK_TEAMS.find((p) => p.slug === t.parent_team_slug)?.name ?? null
    : null,
  memberCount: t.member_count,
}));

const VALID_RANGES: Range[] = ["7d", "30d", "90d"];
const RANGE_DAYS: Record<Range, number> = { "7d": 7, "30d": 30, "90d": 90 };

export default async function DemoOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ repo?: string; range?: string }>;
}) {
  const { repo, range: rangeParam } = await searchParams;
  const repoId = repo ? parseInt(repo, 10) : undefined;
  const range: Range = VALID_RANGES.includes(rangeParam as Range)
    ? (rangeParam as Range)
    : "30d";

  const days = RANGE_DAYS[range];
  const data = repoId
    ? getMockAggregatesForRepo(repoId, days)
    : getMockAggregatesForDays(days);

  const query = new URLSearchParams();
  if (repoId) query.set("repo", String(repoId));
  query.set("range", range);
  const qs = query.toString();

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-baseline justify-between">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">
            Metrics
          </h1>
          <RangeToggle current={range} />
        </div>
        <p className="mt-1 text-[13px] text-muted-foreground">
          <ScopeSelector
            current="everyone"
            teams={SCOPE_TEAMS}
            basePath="/demo"
          />
          {" "}&middot;{" "}
          <RepoFilter repos={DEMO_REPOS} current={repoId} />
          {" "}&middot; {data.totalSessions} session
          {data.totalSessions !== 1 && "s"}
          {data.totalPRs > 0 && (
            <>, {data.totalPRs} finalized PR
            {data.totalPRs !== 1 && "s"}</>
          )} in past {range}
        </p>
      </div>

      <OverviewMetricsGrid
        metrics={data.metrics}
        range={range}
        metricHref={(slug) => `/demo/metrics/${slug}?${qs}`}
      />

      <div className="mt-6 flex gap-6">
        <Link
          href={`/demo/prs`}
          className="text-[13px] text-primary transition-colors hover:underline"
        >
          View all pull requests →
        </Link>
        <Link
          href={`/demo/teams`}
          className="text-[13px] text-primary transition-colors hover:underline"
        >
          Browse teams →
        </Link>
      </div>
    </div>
  );
}
