import { Skeleton, SkeletonPageHeader } from "@/components/skeleton";

// Mirrors /[slug]/compare/page.tsx:
// header + filter bar (time window + developer selector) + leaderboard table.
const LEADERBOARD_COLUMNS = 9;

export default function OrgCompareLoading() {
  return (
    <div>
      <SkeletonPageHeader />

      {/* Filter bar */}
      <div className="flex items-center gap-4 mb-8">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-8 w-56" />
      </div>

      {/* Leaderboard */}
      <div className="bg-surface-1 border border-border-subtle rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-border-subtle">
          <Skeleton className="h-4 w-48" />
        </div>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-text-tertiary text-left border-b border-border-subtle">
              {Array.from({ length: LEADERBOARD_COLUMNS }).map((_, i) => (
                <th key={i} className="px-5 py-2">
                  <Skeleton className="h-3 w-16" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className="border-b border-border-subtle/50">
                {Array.from({ length: LEADERBOARD_COLUMNS }).map((_, j) => (
                  <td key={j} className="px-5 py-2.5">
                    <Skeleton className="h-4 w-full max-w-[80px]" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
