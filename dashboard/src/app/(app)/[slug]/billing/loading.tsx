import { Skeleton } from "@/components/skeleton";

// Mirrors /[slug]/billing/page.tsx:
// header + billing card with plan badge, usage bars, and action buttons.
export default function BillingLoading() {
  return (
    <div className="space-y-8">
      <div>
        <Skeleton className="h-6 w-32 mb-2" />
        <Skeleton className="h-4 w-64" />
      </div>

      <div className="bg-surface-1 rounded-xl border border-border-subtle p-6 space-y-6">
        {/* Plan badge + price */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-5 w-40" />
          </div>
          <Skeleton className="h-9 w-32 rounded-md" />
        </div>

        {/* Usage bars */}
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
    </div>
  );
}
