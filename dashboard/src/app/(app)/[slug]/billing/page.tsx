import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { fetchAPI, orgApiPath, getBilling } from "@/lib/db";
import { redirect } from "next/navigation";
import { BillingCard } from "./billing-card";
import { Skeleton } from "@/components/skeleton";
import { SectionErrorBoundary } from "@/components/section-error-boundary";

interface Member {
  id: number;
  role: string;
  user: { id: number };
}

// Auth redirect must stay at the page level (above Suspense) — calling
// `redirect()` from inside an async Suspense child raises a render-time
// error instead of navigating.
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

  // Kick off both fetches in parallel — no top-level await.
  const billingPromise = getBilling(slug);
  const membersPromise = fetchAPI<{ members: Member[]; current_user_role: string }>(
    orgApiPath(slug, "/members")
  );

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

      <SectionErrorBoundary fallback={<BillingError />}>
        <Suspense fallback={<BillingSkeleton />}>
          <BillingSection
            slug={slug}
            billingPromise={billingPromise}
            membersPromise={membersPromise}
          />
        </Suspense>
      </SectionErrorBoundary>
    </div>
  );
}

function BillingSkeleton() {
  return (
    <div className="bg-surface-1 rounded-xl border border-border-subtle p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-5 w-40" />
        </div>
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>
      <div className="space-y-4 pt-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="flex justify-between">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-2 w-full rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

function BillingError() {
  return (
    <div className="bg-surface-1 rounded-xl border border-border-subtle p-6">
      <p className="text-sm text-text-secondary">
        Unable to load billing information. Please try again.
      </p>
    </div>
  );
}

async function BillingSection({
  slug,
  billingPromise,
  membersPromise,
}: {
  slug: string;
  billingPromise: ReturnType<typeof getBilling>;
  membersPromise: Promise<{ members: Member[]; current_user_role: string }>;
}) {
  // Parallel await — both fetches have been inflight since the page
  // started rendering. If either fails, the SectionErrorBoundary shows
  // the fallback card.
  const [billing, membersData] = await Promise.all([billingPromise, membersPromise]);
  const currentUserRole = membersData.current_user_role ?? "member";
  const isAdmin = currentUserRole === "admin" || currentUserRole === "owner";
  return <BillingCard billing={billing} slug={slug} isAdmin={isAdmin} />;
}
