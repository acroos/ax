import { Skeleton } from "@/components/skeleton";

// Mirrors /prs/[id]/page.tsx:
// back link + header (title + badges + metadata row) + 3-4 category groups
// of metric cards with description. Typical PR has 2-3 populated categories
// with ~3-5 metrics each.
export default function PRDetailLoading() {
  return (
    <div>
      {/* Back link */}
      <Skeleton className="h-3 w-32 mb-2" />

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Skeleton className="h-7 w-96" />
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-14 rounded" />
        </div>
        <div className="flex items-center gap-4">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-5 w-40 rounded" />
          <Skeleton className="h-3 w-56" />
        </div>
      </div>

      {/* Grouped metric cards */}
      <div className="space-y-6">
        {[5, 3, 4].map((count, gi) => (
          <div key={gi}>
            <Skeleton className="h-3 w-32 mb-3 ml-1" />
            <div className="grid grid-cols-3 gap-3">
              {Array.from({ length: count }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-border-subtle bg-surface-1 p-5"
                >
                  <Skeleton className="h-3 w-28 mb-3" />
                  <Skeleton className="h-7 w-20 mb-3" />
                  <Skeleton className="h-3 w-full mb-1.5" />
                  <Skeleton className="h-3 w-4/5" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
