import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { OnboardingSteps } from "./onboarding-steps";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; org?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { role: roleParam, org: orgParam } = await searchParams;
  const isAdmin = roleParam !== "member";

  // Resolve the target org. For members, use the org param from the invite
  // redirect. For admins, use their first (personal) org.
  const orgSlug =
    orgParam || user.organizations[0]?.slug || "";
  const org = user.organizations.find((o) => o.slug === orgSlug);
  const orgName = org?.name || orgSlug;

  return (
    <OnboardingSteps
      displayName={user.display_name || user.github_username || user.gitlab_username || "there"}
      orgSlug={orgSlug}
      orgName={orgName}
      isAdmin={isAdmin}
    />
  );
}
