// Shared skeleton primitives for route-level loading states. Each variant
// composes shadcn's `Skeleton` + `Card` so the loading shapes match the
// loaded surfaces exactly. Variant names are preserved so `loading.tsx`
// files don't need to change shape when skeleton internals are tweaked.

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton as ShadcnSkeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";

export function Skeleton({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return <ShadcnSkeleton className={className} style={style} />;
}

// Metric card skeleton — matches the `Card` shape used on the org overview
// and metric-detail summary stats. Label, value, optional detail.
export function SkeletonMetricCard({ showDetail = true }: { showDetail?: boolean }) {
  return (
    <Card className="p-5">
      <CardContent className="p-0">
        <Skeleton className="mb-3 h-3 w-24" />
        <Skeleton className="mb-2 h-7 w-20" />
        {showDetail && <Skeleton className="h-3 w-32" />}
      </CardContent>
    </Card>
  );
}

// A category block on the overview page: small heading + 3-col grid of cards.
export function SkeletonMetricCategory({ count = 6 }: { count?: number }) {
  return (
    <div className="mb-8">
      <Skeleton className="mb-3 ml-1 h-3 w-32" />
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: count }).map((_, i) => (
          <SkeletonMetricCard key={i} />
        ))}
      </div>
    </div>
  );
}

// Table row skeleton — N cells of pulse bars, used inside a shadcn TableBody.
export function SkeletonTableRow({ columns }: { columns: number }) {
  return (
    <TableRow>
      {Array.from({ length: columns }).map((_, i) => (
        <TableCell key={i}>
          <Skeleton className="h-4 w-full max-w-[120px]" />
        </TableCell>
      ))}
    </TableRow>
  );
}

// Bare `<tbody>` of N skeleton rows — used as a Suspense fallback when the
// table header is rendered synchronously by the page but the body streams.
// Emitted as a raw <tbody> so it slots into a Table without nesting a
// second TableBody (which React would warn about).
export function SkeletonTableBody({
  rows = 10,
  columns,
}: {
  rows?: number;
  columns: number;
}) {
  return (
    <tbody>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonTableRow key={i} columns={columns} />
      ))}
    </tbody>
  );
}

// A generic page header skeleton: h1 line + subtitle line.
export function SkeletonPageHeader({ className = "mb-8" }: { className?: string }) {
  return (
    <div className={className}>
      <Skeleton className="mb-2 h-7 w-48" />
      <Skeleton className="h-4 w-64" />
    </div>
  );
}

// Chart panel skeleton — matches the bordered Card used on metric-detail.
// `title` renders real heading text so the panel's shape doesn't shift when
// the chart resolves; only the chart body itself is a skeleton block.
export function SkeletonChartPanel({
  title,
  height = 256,
}: {
  title: string;
  height?: number;
}) {
  return (
    <Card className="p-5">
      <CardContent className="p-0">
        <h2 className="mb-4 text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
        <Skeleton className="w-full" style={{ height }} />
      </CardContent>
    </Card>
  );
}
