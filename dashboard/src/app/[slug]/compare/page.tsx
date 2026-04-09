import { isAPIMode } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function OrgComparePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (!isAPIMode()) {
    redirect("/compare");
  }

  const { slug } = await params;

  return (
    <div>
      <h1 className="text-xl font-semibold text-text-primary mb-6">
        Compare Developers
      </h1>
      <p className="text-sm text-text-secondary">
        Org-scoped comparison for <span className="font-mono text-accent">{slug}</span>.
        Full implementation coming in a follow-up update.
      </p>
    </div>
  );
}
