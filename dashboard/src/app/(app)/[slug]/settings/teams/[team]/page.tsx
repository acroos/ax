import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  getTeamAsync,
  fetchAPI,
  orgApiPath,
  type TeamDetail,
  type TeamMember,
} from "@/lib/db";
import { Skeleton } from "@/components/skeleton";
import { SectionErrorBoundary } from "@/components/section-error-boundary";
import { Card, CardContent } from "@/components/ui/card";
import { TeamEditForm } from "./team-edit-form";

type MembersResponse = {
  members: { id: number; role: string; user: { id: number; github_username: string; display_name: string | null; avatar_url: string | null } }[];
  current_user_role: string;
};

export default async function TeamSettingsPage({
  params,
}: {
  params: Promise<{ slug: string; team: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { slug, team: teamSlug } = await params;

  const teamPromise = getTeamAsync(slug, teamSlug);
  const orgMembersPromise = fetchAPI<MembersResponse>(
    orgApiPath(slug, "/members"),
  ).catch(() => null);

  return (
    <div className="space-y-8">
      <div>
        <a
          href={`/${slug}/settings`}
          className="text-[13px] text-primary transition-colors hover:underline"
        >
          &larr; Back to settings
        </a>
      </div>

      <SectionErrorBoundary
        fallback={
          <Card className="p-6">
            <CardContent className="p-0">
              <p className="text-sm text-muted-foreground">
                Could not load team details.
              </p>
            </CardContent>
          </Card>
        }
      >
        <Suspense
          fallback={
            <Card className="p-6">
              <CardContent className="space-y-4 p-0">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
          }
        >
          <AsyncTeamEditForm
            slug={slug}
            teamPromise={teamPromise}
            orgMembersPromise={orgMembersPromise}
          />
        </Suspense>
      </SectionErrorBoundary>
    </div>
  );
}

async function AsyncTeamEditForm({
  slug,
  teamPromise,
  orgMembersPromise,
}: {
  slug: string;
  teamPromise: Promise<TeamDetail>;
  orgMembersPromise: Promise<MembersResponse | null>;
}) {
  const [team, orgMembersData] = await Promise.all([
    teamPromise,
    orgMembersPromise,
  ]);

  // Build list of org members available to add (not already on the team)
  const teamMemberIds = new Set(team.members.map((m) => m.user.id));
  const availableMembers = (orgMembersData?.members ?? [])
    .filter((m) => !teamMemberIds.has(m.user.id))
    .map((m) => ({
      org_membership_id: m.id,
      user: m.user,
    }));

  return (
    <TeamEditForm
      slug={slug}
      team={team}
      availableMembers={availableMembers}
    />
  );
}
