import { SkeletonPageHeader, Skeleton } from "@/components/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function TeamsIndexLoading() {
  return (
    <div>
      <SkeletonPageHeader />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="gap-0 p-5">
            <CardContent className="p-0">
              <Skeleton className="mb-3 h-5 w-32" />
              <Skeleton className="h-4 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
