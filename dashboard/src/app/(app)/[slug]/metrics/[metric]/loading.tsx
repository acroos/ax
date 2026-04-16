import { Skeleton } from "@/components/skeleton";

// Mirrors /[slug]/metrics/[metric]/page.tsx:
// back link + header + 5 summary stat cards + chart panel + PR table + doc card.
export default function MetricDetailLoading() {
  return (
    <div>
      {/* Back link */}
      <Skeleton className="h-4 w-32 mb-6" />

      {/* Header */}
      <div className="mb-6 mt-4">
        <div className="flex items-center gap-3 mb-2">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-5 w-28 rounded-full" />
        </div>
        <Skeleton className="h-4 w-40" />
      </div>

      {/* Summary stats: Count / Avg / Median / Min / Max */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-border-subtle bg-surface-1 p-4 text-center"
          >
            <Skeleton className="h-3 w-16 mx-auto mb-2" />
            <Skeleton className="h-5 w-12 mx-auto" />
          </div>
        ))}
      </div>

      {/* Chart panel */}
      <div className="rounded-xl border border-border-subtle bg-surface-1 p-5 mb-6">
        <Skeleton className="h-3 w-40 mb-4" />
        <Skeleton className="h-64 w-full" />
      </div>

      {/* PR table */}
      <div className="rounded-xl border border-border-subtle bg-surface-1 overflow-hidden mb-6">
        <div className="px-5 py-3 border-b border-border-subtle">
          <Skeleton className="h-3 w-56" />
        </div>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-text-tertiary text-left border-b border-border-subtle">
              {["PR", "Title", "Value", "State"].map((h) => (
                <th key={h} className="px-5 py-2">
                  <Skeleton className="h-3 w-12" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 8 }).map((_, i) => (
              <tr key={i} className="border-b border-border-subtle/50 last:border-0">
                <td className="px-5 py-2.5">
                  <Skeleton className="h-4 w-10" />
                </td>
                <td className="px-5 py-2.5">
                  <Skeleton className="h-4 w-full max-w-[280px]" />
                </td>
                <td className="px-5 py-2.5">
                  <Skeleton className="h-4 w-12 ml-auto" />
                </td>
                <td className="px-5 py-2.5">
                  <Skeleton className="h-5 w-16 rounded-full mx-auto" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* About this metric */}
      <div className="rounded-xl border border-border-subtle bg-surface-1 p-6 space-y-3">
        <Skeleton className="h-3 w-40 mb-2" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/6" />
      </div>
    </div>
  );
}
