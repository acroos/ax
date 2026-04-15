import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { OnboardingSteps } from "./onboarding-steps";

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <OnboardingSteps
      displayName={user.display_name || user.github_username}
      orgSlug={user.organizations[0]?.slug || ""}
    />
  );
}
