import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { fetchAPI, orgApiPath, getBilling } from "@/lib/db";
import { redirect } from "next/navigation";
import { BillingCard } from "./billing-card";
import { Skeleton } from "@/components/skeleton";
import { SectionErrorBoundary } from "@/components/section-error-boundary";
import { Card, CardContent } from "@/components/ui/card";

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
        <h1 className="text-xl font-semibold text-foreground">Billing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your plan for{" "}
          <span className="font-mono text-primary">{slug}</span>
        </p>
      </div>

      {query.billing === "success" && (
        <div className="rounded-lg border border-success/25 bg-success/10 px-4 py-3 text-sm text-success">
          Your plan has been upgraded successfully.
        </div>
      )}
      {query.billing === "canceled" && (
        <div className="rounded-lg border border-notice/25 bg-notice/10 px-4 py-3 text-sm text-notice">
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
    <Card className="p-6">
      <CardContent className="space-y-6 p-0">
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
      </CardContent>
    </Card>
  );
}

function BillingError() {
  return (
    <Card className="p-6">
      <CardContent className="p-0">
        <p className="text-sm text-muted-foreground">
          Unable to load billing information. Please try again.
        </p>
      </CardContent>
    </Card>
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
