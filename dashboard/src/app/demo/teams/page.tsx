import Link from "next/link";
import { Users } from "lucide-react";
import { MOCK_TEAMS } from "@/lib/mock/data";
import { Card, CardContent } from "@/components/ui/card";

export default function DemoTeamsPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">
          Teams
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {MOCK_TEAMS.length} teams in Acme Engineering
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MOCK_TEAMS.map((team) => (
          <Link key={team.slug} href={`/demo/teams/${team.slug}`} className="block">
            <Card className="p-5 transition-colors hover:border-primary/30 hover:bg-accent/40">
              <CardContent className="p-0">
                <div className="mb-2 flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-base font-semibold text-foreground">
                    {team.name}
                  </h2>
                </div>
                {team.parent_team_slug && (
                  <p className="mb-2 text-xs text-muted-foreground">
                    Part of{" "}
                    {MOCK_TEAMS.find((t) => t.slug === team.parent_team_slug)?.name}
                  </p>
                )}
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span>
                    {team.member_count} member{team.member_count !== 1 ? "s" : ""}
                  </span>
                  {team.child_team_count > 0 && (
                    <span>
                      {team.child_team_count} sub-team
                      {team.child_team_count !== 1 ? "s" : ""}
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
