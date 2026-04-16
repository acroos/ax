import { getCurrentUser } from "@/lib/auth";
import { fetchAPI, orgApiPath, getBilling, type BillingInfo } from "@/lib/db";
import { redirect } from "next/navigation";
import { BillingCard } from "./billing-card";

interface Member {
  id: number;
  role: string;
  user: { id: number };
}

export default async function BillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ billing?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { slug } = await params;
  const query = await searchParams;

  let billing: BillingInfo | null = null;
  let membersData: { members: Member[]; current_user_role: string } | null = null;

  try {
    [billing, membersData] = await Promise.all([
      getBilling(slug),
      fetchAPI<{ members: Member[]; current_user_role: string }>(
        orgApiPath(slug, "/members")
      ),
    ]);
  } catch {
    // If billing endpoint fails, show error state
  }

  const currentUserRole = membersData?.current_user_role ?? "member";
  const isAdmin = currentUserRole === "admin" || currentUserRole === "owner";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Billing</h1>
        <p className="text-sm text-text-secondary mt-1">
          Manage your plan for{" "}
          <span className="font-mono text-accent">{slug}</span>
        </p>
      </div>

      {query.billing === "success" && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-3 text-sm text-green-400">
          Your plan has been upgraded successfully.
        </div>
      )}
      {query.billing === "canceled" && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-4 py-3 text-sm text-yellow-400">
          Checkout was canceled. No changes were made.
        </div>
      )}

      {billing ? (
        <BillingCard billing={billing} slug={slug} isAdmin={isAdmin} />
      ) : (
        <div className="bg-surface-1 rounded-xl border border-border-subtle p-6">
          <p className="text-sm text-text-secondary">
            Unable to load billing information. Please try again.
          </p>
        </div>
      )}
    </div>
  );
}
