// Shared skeleton primitives for route-level loading states.
// Mirrors the dashboard's surface palette so skeletons sit naturally
// within existing cards and panels.

export function Skeleton({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`bg-surface-2/60 rounded animate-pulse ${className}`}
      style={style}
    />
  );
}

// Metric card skeleton — matches the `metric-card` shape used on the org
// overview and metric-detail summary stats. Label, value, optional detail.
export function SkeletonMetricCard({ showDetail = true }: { showDetail?: boolean }) {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-1 p-5">
      <Skeleton className="h-3 w-24 mb-3" />
      <Skeleton className="h-7 w-20 mb-2" />
      {showDetail && <Skeleton className="h-3 w-32" />}
    </div>
  );
}

// A category block on the overview page: small heading + 3-col grid of cards.
export function SkeletonMetricCategory({ count = 6 }: { count?: number }) {
  return (
    <div className="mb-8">
      <Skeleton className="h-3 w-32 mb-3 ml-1" />
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: count }).map((_, i) => (
          <SkeletonMetricCard key={i} />
        ))}
      </div>
    </div>
  );
}

// Table row skeleton — N cells of pulse bars, used inside a `<tbody>`.
export function SkeletonTableRow({ columns }: { columns: number }) {
  return (
    <tr className="border-t border-border-subtle">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton className="h-4 w-full max-w-[120px]" />
        </td>
      ))}
    </tr>
  );
}

// A generic page header skeleton: h1 line + subtitle line.
export function SkeletonPageHeader({ className = "mb-8" }: { className?: string }) {
  return (
    <div className={className}>
      <Skeleton className="h-7 w-48 mb-2" />
      <Skeleton className="h-4 w-64" />
    </div>
  );
}
