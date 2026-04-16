import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { fetchAPI, orgApiPath, getGithubInstallation } from "@/lib/db";
import { redirect } from "next/navigation";
import { MembersSection, type Member } from "./members-section";
import { InvitesSection, type Invite } from "./invites-section";
import { GitHubAppCard } from "./github-app-card";
import { Skeleton } from "@/components/skeleton";
import { SectionErrorBoundary } from "@/components/section-error-boundary";

type MembersResponse = { members: Member[]; current_user_role: string };
type InstallationResponse = Awaited<ReturnType<typeof getGithubInstallation>> | null;

async function fetchSafe<T>(path: string): Promise<T | null> {
  try {
    return await fetchAPI<T>(path);
  } catch {
    return null;
  }
}

// Auth redirect stays at page level (above Suspense); all other fetches
// stream in parallel, each wrapped in its own Suspense so whichever
// resolves first renders first.
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

  // Kick off all three fetches in parallel — shared across cards below.
  const installationPromise = getGithubInstallation(slug).catch(() => null);
  const membersPromise = fetchSafe<MembersResponse>(orgApiPath(slug, "/members"));
  const invitesPromise = fetchSafe<Invite[]>(orgApiPath(slug, "/invites"));

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

      <SectionErrorBoundary fallback={<SettingsCardSkeleton rows={3} />}>
        <Suspense fallback={<SettingsCardSkeleton rows={3} />}>
          <AsyncGitHubAppCard
            slug={slug}
            installationPromise={installationPromise}
            membersPromise={membersPromise}
            installedParam={query.installed}
            errorParam={query.error}
          />
        </Suspense>
      </SectionErrorBoundary>

      <SectionErrorBoundary fallback={<SettingsCardSkeleton rows={4} />}>
        <Suspense fallback={<SettingsCardSkeleton rows={4} />}>
          <AsyncMembersSection
            slug={slug}
            currentUserId={user.id}
            membersPromise={membersPromise}
          />
        </Suspense>
      </SectionErrorBoundary>

      <SectionErrorBoundary fallback={<SettingsCardSkeleton rows={2} />}>
        <Suspense fallback={<SettingsCardSkeleton rows={2} />}>
          <AsyncInvitesSection
            slug={slug}
            membersPromise={membersPromise}
            invitesPromise={invitesPromise}
          />
        </Suspense>
      </SectionErrorBoundary>
    </div>
  );
}

function SettingsCardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="bg-surface-1 rounded-xl border border-border-subtle p-6 space-y-4">
      <div>
        <Skeleton className="h-4 w-40 mb-2" />
        <Skeleton className="h-3 w-72" />
      </div>
      <div className="space-y-2 pt-2">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}

// Derive isAdmin from the shared members response. Consumed by every card.
function resolveIsAdmin(
  members: MembersResponse | null,
  installation: InstallationResponse
): boolean {
  const role = members?.current_user_role ?? installation?.user_role ?? "member";
  return role === "admin" || role === "owner";
}

async function AsyncGitHubAppCard({
  slug,
  installationPromise,
  membersPromise,
  installedParam,
  errorParam,
}: {
  slug: string;
  installationPromise: Promise<InstallationResponse>;
  membersPromise: Promise<MembersResponse | null>;
  installedParam: string | undefined;
  errorParam: string | undefined;
}) {
  const [installation, members] = await Promise.all([
    installationPromise,
    membersPromise,
  ]);
  const isAdmin = resolveIsAdmin(members, installation);
  return (
    <GitHubAppCard
      slug={slug}
      installation={installation?.installation ?? null}
      isAdmin={isAdmin}
      installedParam={installedParam}
      errorParam={errorParam}
    />
  );
}

async function AsyncMembersSection({
  slug,
  currentUserId,
  membersPromise,
}: {
  slug: string;
  currentUserId: number;
  membersPromise: Promise<MembersResponse | null>;
}) {
  const members = await membersPromise;
  const isAdmin = resolveIsAdmin(members, null);
  return (
    <MembersSection
      members={members?.members ?? []}
      currentUserId={currentUserId}
      isAdmin={isAdmin}
      slug={slug}
    />
  );
}

async function AsyncInvitesSection({
  slug,
  membersPromise,
  invitesPromise,
}: {
  slug: string;
  membersPromise: Promise<MembersResponse | null>;
  invitesPromise: Promise<Invite[] | null>;
}) {
  const [members, invites] = await Promise.all([membersPromise, invitesPromise]);
  const isAdmin = resolveIsAdmin(members, null);
  return (
    <InvitesSection
      invites={invites ?? []}
      isAdmin={isAdmin}
      slug={slug}
    />
  );
}
