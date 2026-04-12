import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function RootPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  // If the user has an org, redirect to it
  const defaultOrg = user.organizations[0]?.slug;
  if (defaultOrg) {
    redirect(`/${defaultOrg}`);
  }

  return (
    <div className="flex items-center justify-center h-[60vh]">
      <div className="text-center space-y-3">
        <div className="text-text-tertiary text-[40px]">&#x2B21;</div>
        <h2 className="text-text-primary text-lg font-medium">Welcome to AX</h2>
        <p className="text-text-secondary text-sm max-w-[320px]">
          You don&apos;t belong to any organizations yet. Ask your team admin
          for an invite, or check the{" "}
          <Link href="/docs" className="text-accent hover:text-accent-hover">
            docs
          </Link>{" "}
          to get started.
        </p>
      </div>
    </div>
  );
}
