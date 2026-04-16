import { Skeleton } from "@/components/skeleton";
import { Card, CardContent } from "@/components/ui/card";

// Mirrors /prs/[id]/page.tsx:
// back link + header (title + badges + metadata row) + 3-4 category groups
// of metric cards with description. Typical PR has 2-3 populated categories
// with ~3-5 metrics each.
export default function PRDetailLoading() {
  return (
    <div>
      {/* Back link */}
      <Skeleton className="mb-2 h-3 w-32" />

      {/* Header */}
      <div className="mb-8">
        <div className="mb-2 flex items-center gap-3">
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
            <Skeleton className="mb-3 ml-1 h-3 w-32" />
            <div className="grid grid-cols-3 gap-3">
              {Array.from({ length: count }).map((_, i) => (
                <Card key={i} className="p-5">
                  <CardContent className="p-0">
                    <Skeleton className="mb-3 h-3 w-28" />
                    <Skeleton className="mb-3 h-7 w-20" />
                    <Skeleton className="mb-1.5 h-3 w-full" />
                    <Skeleton className="h-3 w-4/5" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
