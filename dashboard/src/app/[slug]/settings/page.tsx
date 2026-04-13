import { getCurrentUser } from "@/lib/auth";
import { getGithubInstallation } from "@/lib/db";
import { redirect } from "next/navigation";
import { GitHubAppCard } from "./github-app-card";

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

  let installationData;
  try {
    installationData = await getGithubInstallation(slug);
  } catch {
    installationData = null;
  }

  const isAdmin = installationData?.user_role === "admin" || installationData?.user_role === "owner";

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

      <div className="bg-surface-1 rounded-xl border border-border-subtle p-6 space-y-4">
        <h2 className="text-sm font-medium text-text-primary">Members</h2>
        <p className="text-xs text-text-tertiary">
          Member management UI coming in a follow-up update.
        </p>
      </div>

      <div className="bg-surface-1 rounded-xl border border-border-subtle p-6 space-y-4">
        <h2 className="text-sm font-medium text-text-primary">Invites</h2>
        <p className="text-xs text-text-tertiary">
          Invite management UI coming in a follow-up update.
        </p>
      </div>
    </div>
  );
}
