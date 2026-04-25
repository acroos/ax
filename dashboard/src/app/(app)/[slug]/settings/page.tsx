export const runtime = "edge";

import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { fetchAPI, orgApiPath, getGithubInstallation, getGitlabConnection, getBilling, type BillingInfo } from "@/lib/db";
import { redirect } from "next/navigation";
import { MembersSection, type Member } from "./members-section";
import { InvitesSection, type Invite } from "./invites-section";
import { GitHubAppCard } from "./github-app-card";
import { GitLabConnectionCard } from "./gitlab-connection-card";
import { TeamsSection } from "./teams-section";
import { DeleteOrgSection } from "./delete-org-section";
import { listTeamsAsync, type Team } from "@/lib/db";
import { Skeleton } from "@/components/skeleton";
import { SectionErrorBoundary } from "@/components/section-error-boundary";
import { Card, CardContent } from "@/components/ui/card";

type MembersResponse = { members: Member[]; current_user_role: string };
type InstallationResponse = Awaited<
  ReturnType<typeof getGithubInstallation>
> | null;
type GitlabConnectionResponse = Awaited<
  ReturnType<typeof getGitlabConnection>
> | null;

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
  searchParams: Promise<{ installed?: string; error?: string; gitlab_connected?: string; gitlab_error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { slug } = await params;
  const query = await searchParams;

  // Kick off all fetches in parallel — shared across cards below.
  // Bypass the cache when returning from GitHub App installation or
  // GitLab connection so the settings page always shows latest state.
  const justInstalled = query.installed === "true" || query.installed === "false";
  const justConnectedGitlab = query.gitlab_connected === "true" || query.gitlab_connected === "false";
  const installationPromise = getGithubInstallation(
    slug,
    justInstalled ? { revalidate: false } : undefined,
  ).catch(() => null);
  const gitlabConnectionPromise = getGitlabConnection(
    slug,
    justConnectedGitlab ? { revalidate: false } : undefined,
  ).catch(() => null);
  const membersPromise = fetchSafe<MembersResponse>(
    orgApiPath(slug, "/members"),
  );
  const invitesPromise = fetchSafe<Invite[]>(orgApiPath(slug, "/invites"));

  // Billing (needed for seat-cost notice on the invite form)
  const billingPromise = getBilling(slug).catch(() => null);

  // Teams (Pro-only, will 403 on free plan — catch and return empty)
  const currentOrg = user.organizations.find((o) => o.slug === slug);
  const isProPlan = currentOrg?.plan === "pro" && !currentOrg?.is_personal;
  const teamsPromise = isProPlan
    ? listTeamsAsync(slug).catch(() => [])
    : Promise.resolve([]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-foreground">
          Organization Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage settings for{" "}
          <span className="font-mono text-primary">{slug}</span>
        </p>
      </div>

      <SectionErrorBoundary>
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

      <SectionErrorBoundary>
        <Suspense fallback={<SettingsCardSkeleton rows={3} />}>
          <AsyncGitLabConnectionCard
            slug={slug}
            gitlabConnectionPromise={gitlabConnectionPromise}
            membersPromise={membersPromise}
            connectedParam={query.gitlab_connected}
            errorParam={query.gitlab_error}
          />
        </Suspense>
      </SectionErrorBoundary>

      <SectionErrorBoundary>
        <Suspense fallback={<SettingsCardSkeleton rows={4} />}>
          <AsyncMembersSection
            slug={slug}
            currentUserId={user.id}
            membersPromise={membersPromise}
          />
        </Suspense>
      </SectionErrorBoundary>

      {isProPlan && (
        <SectionErrorBoundary>
          <Suspense fallback={<SettingsCardSkeleton rows={3} />}>
            <AsyncTeamsSection
              slug={slug}
              membersPromise={membersPromise}
              teamsPromise={teamsPromise}
            />
          </Suspense>
        </SectionErrorBoundary>
      )}

      <SectionErrorBoundary>
        <Suspense fallback={<SettingsCardSkeleton rows={2} />}>
          <AsyncInvitesSection
            slug={slug}
            membersPromise={membersPromise}
            invitesPromise={invitesPromise}
            billingPromise={billingPromise}
          />
        </Suspense>
      </SectionErrorBoundary>

      {!currentOrg?.is_personal && (
        <SectionErrorBoundary>
          <Suspense fallback={null}>
            <AsyncDeleteOrgSection
              slug={slug}
              orgName={currentOrg?.name ?? slug}
              membersPromise={membersPromise}
            />
          </Suspense>
        </SectionErrorBoundary>
      )}
    </div>
  );
}

function SettingsCardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Card className="p-6">
      <CardContent className="space-y-4 p-0">
        <div>
          <Skeleton className="mb-2 h-4 w-40" />
          <Skeleton className="h-3 w-72" />
        </div>
        <div className="space-y-2 pt-2">
          {Array.from({ length: rows }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// Derive isAdmin from the shared members response. Consumed by every card.
function resolveIsAdmin(
  members: MembersResponse | null,
  connectionOrInstallation: InstallationResponse | GitlabConnectionResponse | null,
): boolean {
  const role =
    members?.current_user_role ?? connectionOrInstallation?.user_role ?? "member";
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

async function AsyncGitLabConnectionCard({
  slug,
  gitlabConnectionPromise,
  membersPromise,
  connectedParam,
  errorParam,
}: {
  slug: string;
  gitlabConnectionPromise: Promise<GitlabConnectionResponse>;
  membersPromise: Promise<MembersResponse | null>;
  connectedParam: string | undefined;
  errorParam: string | undefined;
}) {
  const [gitlabConnection, members] = await Promise.all([
    gitlabConnectionPromise,
    membersPromise,
  ]);
  const isAdmin = resolveIsAdmin(members, null);
  return (
    <GitLabConnectionCard
      slug={slug}
      connection={gitlabConnection?.connection ?? null}
      isAdmin={isAdmin}
      connectedParam={connectedParam}
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
  billingPromise,
}: {
  slug: string;
  membersPromise: Promise<MembersResponse | null>;
  invitesPromise: Promise<Invite[] | null>;
  billingPromise: Promise<BillingInfo | null>;
}) {
  const [members, invites, billing] = await Promise.all([
    membersPromise,
    invitesPromise,
    billingPromise,
  ]);
  const isAdmin = resolveIsAdmin(members, null);
  const seatPriceCents =
    billing?.subscription?.status &&
    ["active", "trialing"].includes(billing.subscription.status)
      ? billing.subscription.seat_price_cents
      : null;
  return (
    <InvitesSection
      invites={invites ?? []}
      isAdmin={isAdmin}
      slug={slug}
      seatPriceCents={seatPriceCents ?? undefined}
    />
  );
}

async function AsyncTeamsSection({
  slug,
  membersPromise,
  teamsPromise,
}: {
  slug: string;
  membersPromise: Promise<MembersResponse | null>;
  teamsPromise: Promise<Team[]>;
}) {
  const [members, teams] = await Promise.all([membersPromise, teamsPromise]);
  const isAdmin = resolveIsAdmin(members, null);
  return <TeamsSection teams={teams} isAdmin={isAdmin} slug={slug} />;
}

async function AsyncDeleteOrgSection({
  slug,
  orgName,
  membersPromise,
}: {
  slug: string;
  orgName: string;
  membersPromise: Promise<MembersResponse | null>;
}) {
  const members = await membersPromise;
  const role = members?.current_user_role ?? "member";
  if (role !== "owner") return null;
  return <DeleteOrgSection slug={slug} orgName={orgName} />;
}
