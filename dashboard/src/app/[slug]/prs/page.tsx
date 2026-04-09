import { isAPIMode } from "@/lib/auth";
import { redirect } from "next/navigation";

// In managed mode, org-scoped PR list.
// In local mode, redirect to the existing /prs page.
export default async function OrgPRsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (!isAPIMode()) {
    redirect("/prs");
  }

  const { slug } = await params;

  return (
    <div>
      <h1 className="text-xl font-semibold text-text-primary mb-6">
        Pull Requests
      </h1>
      <p className="text-sm text-text-secondary">
        Org-scoped PR view for <span className="font-mono text-accent">{slug}</span>.
        Full implementation coming in a follow-up update.
      </p>
    </div>
  );
}
