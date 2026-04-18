import Link from "next/link";
import { Users, GitBranch } from "lucide-react";
import { listTeamsAsync } from "@/lib/db";
import type { Team } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";

export default async function TeamsIndexPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const teams = await listTeamsAsync(slug);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">
          Teams
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {teams.length} team{teams.length !== 1 && "s"}
        </p>
      </div>

      {teams.length === 0 ? (
        <div className="flex h-[60vh] items-center justify-center">
          <div className="space-y-3 text-center">
            <h2 className="text-lg font-medium text-foreground">
              No teams yet
            </h2>
            <p className="text-sm text-muted-foreground">
              Teams can be created in org settings.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {teams.map((team) => (
            <TeamCard key={team.id} team={team} slug={slug} />
          ))}
        </div>
      )}
    </div>
  );
}

function TeamCard({ team, slug }: { team: Team; slug: string }) {
  return (
    <Link href={`/${slug}/teams/${team.slug}`} className="block">
      <Card className="gap-0 p-5 transition-colors hover:border-primary/30 hover:bg-accent/40 cursor-pointer">
        <CardContent className="p-0">
          <div className="mb-3 text-[15px] font-medium text-foreground">
            {team.name}
          </div>
          <div className="flex items-center gap-4 text-[12px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Users className="size-3.5" aria-hidden />
              {team.member_count} member{team.member_count !== 1 && "s"}
            </span>
            {team.child_team_count > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <GitBranch className="size-3.5" aria-hidden />
                {team.child_team_count} sub-team{team.child_team_count !== 1 && "s"}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
