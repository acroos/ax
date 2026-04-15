import { getCurrentUser } from "@/lib/auth";
import { fetchAPI, orgApiPath, getGithubInstallation } from "@/lib/db";
import { redirect } from "next/navigation";
import { MembersSection, type Member } from "./members-section";
import { InvitesSection, type Invite } from "./invites-section";
import { GitHubAppCard } from "./github-app-card";

async function fetchSafe<T>(path: string): Promise<T | null> {
  try {
    return await fetchAPI<T>(path);
  } catch {
    return null;
  }
}

export default async function OrgSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ installed?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { slug } = await params;
  const query = await searchParams;

  const [installationData, membersData, invites] = await Promise.all([
    getGithubInstallation(slug).catch(() => null),
    fetchSafe<{ members: Member[]; current_user_role: string }>(
      orgApiPath(slug, "/members")
    ),
    fetchSafe<Invite[]>(orgApiPath(slug, "/invites")),
  ]);

  const members = membersData?.members ?? [];
  const currentUserRole = membersData?.current_user_role ?? installationData?.user_role ?? "member";
  const isAdmin = currentUserRole === "admin" || currentUserRole === "owner";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">
          Organization Settings
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Manage settings for{" "}
          <span className="font-mono text-accent">{slug}</span>
        </p>
      </div>

      <GitHubAppCard
        slug={slug}
        installation={installationData?.installation ?? null}
        isAdmin={isAdmin}
        installedParam={query.installed}
        errorParam={query.error}
      />

      <MembersSection
        members={members}
        currentUserId={user.id}
        isAdmin={isAdmin}
        slug={slug}
      />

      <InvitesSection
        invites={invites ?? []}
        isAdmin={isAdmin}
        slug={slug}
      />
    </div>
  );
}
