import Link from "next/link";
import {
  getMockTeamMetrics,
  getMockTeamDetail,
  MOCK_TEAMS,
} from "@/lib/mock/data";
import { RangeToggle, type Range } from "@/components/range-toggle";
import { ScopeSelector, type ScopeTeam } from "@/components/scope-selector";
import { ClientTooltip } from "@/components/client-tooltip";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Users } from "lucide-react";
import { OverviewMetricsGrid } from "@/components/overview-metrics-grid";

const VALID_RANGES: Range[] = ["7d", "30d", "90d"];
const RANGE_DAYS: Record<Range, number> = { "7d": 7, "30d": 30, "90d": 90 };

const SCOPE_TEAMS: ScopeTeam[] = MOCK_TEAMS.map((t) => ({
  slug: t.slug,
  name: t.name,
  parentName: t.parent_team_slug
    ? MOCK_TEAMS.find((p) => p.slug === t.parent_team_slug)?.name ?? null
    : null,
  memberCount: t.member_count,
}));

export default async function DemoTeamOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ team: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { team: teamSlug } = await params;
  const { range: rangeParam } = await searchParams;
  const range: Range = VALID_RANGES.includes(rangeParam as Range)
    ? (rangeParam as Range)
    : "30d";

  const detail = getMockTeamDetail(teamSlug);
  if (!detail) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <p className="text-muted-foreground">Team not found.</p>
      </div>
    );
  }

  const days = RANGE_DAYS[range];
  const data = getMockTeamMetrics(teamSlug, days);

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
            current={teamSlug}
            teams={SCOPE_TEAMS}
            basePath="/demo"
          />
          {" "}&middot;{" "}
          {detail.members.length} member
          {detail.members.length !== 1 ? "s" : ""} &middot;{" "}
          {data.totalSessions} session
          {data.totalSessions !== 1 ? "s" : ""}
          {data.totalPRs > 0 && (
            <>, {data.totalPRs} finalized PR
            {data.totalPRs !== 1 ? "s" : ""}</>
          )} in past {range}
        </p>
      </div>

      {data.totalPRs === 0 && data.totalSessions === 0 ? (
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
      ) : (
        <OverviewMetricsGrid
          metrics={data.metrics}
          range={range}
          metricHref={(slug) => `/demo/teams/${teamSlug}/metrics/${slug}?range=${range}`}
        />
      )}

      {/* Team members */}
      <div className="mb-6">
        <h3 className="mb-3 text-sm font-medium text-muted-foreground">
          Team Members
        </h3>
        <div className="flex gap-3">
          {detail.members.map((tm) => (
            <ClientTooltip
              key={tm.id}
              content={tm.user.display_name || tm.user.github_username}
            >
              <Avatar>
                <AvatarFallback>
                  {(tm.user.display_name || tm.user.github_username)
                    .charAt(0)
                    .toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </ClientTooltip>
          ))}
        </div>
      </div>

      {/* Child teams */}
      {detail.child_teams.length > 0 && (
        <div className="mb-6">
          <h3 className="mb-3 text-sm font-medium text-muted-foreground">
            Sub-teams
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {detail.child_teams.map((ct) => (
              <Link key={ct.slug} href={`/demo/teams/${ct.slug}`} className="block">
                <Card className="p-4 transition-colors hover:border-primary/30 hover:bg-accent/40">
                  <CardContent className="flex items-center gap-2 p-0">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{ct.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {ct.member_count} member{ct.member_count !== 1 ? "s" : ""}
                    </span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6">
        <Link
          href={`/demo/teams/${teamSlug}/prs`}
          className="text-[13px] text-primary transition-colors hover:underline"
        >
          View all pull requests →
        </Link>
      </div>
    </div>
  );
}
