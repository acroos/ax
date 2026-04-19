import { Skeleton } from "@/components/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function MyMetricDetailLoading() {
  return (
    <div>
      {/* Back link */}
      <Skeleton className="mb-6 h-4 w-32" />

      {/* Header + range toggle */}
      <div className="mb-6 mt-4">
        <div className="flex items-baseline justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-5 w-28 rounded-full" />
          </div>
          <Skeleton className="h-8 w-[120px] rounded-lg" />
        </div>
        <Skeleton className="mt-1 h-4 w-40" />
      </div>

      {/* Summary stats: Count / Avg / P10 / P50 / P90 */}
      <div className="mb-6 grid grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="p-4 text-center">
            <CardContent className="p-0">
              <Skeleton className="mx-auto mb-2 h-3 w-16" />
              <Skeleton className="mx-auto h-5 w-12" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Trend chart */}
      <Card className="mb-6 p-5">
        <CardContent className="p-0">
          <Skeleton className="mb-4 h-3 w-20" />
          <Skeleton className="h-[280px] w-full" />
        </CardContent>
      </Card>

      {/* Distribution + Notable PRs */}
      <div className="mb-6 grid grid-cols-2 gap-3">
        <Card className="p-5">
          <CardContent className="p-0">
            <Skeleton className="mb-4 h-3 w-28" />
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-5 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
        <Card className="p-5">
          <CardContent className="p-0">
            <Skeleton className="mb-4 h-3 w-24" />
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-5 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* About this metric */}
      <Card className="p-6">
        <CardContent className="space-y-3 p-0">
          <Skeleton className="mb-2 h-3 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-4/6" />
        </CardContent>
      </Card>
    </div>
  );
}
