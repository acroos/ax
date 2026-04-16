import { SkeletonPageHeader, SkeletonTableRow } from "@/components/skeleton";

// Mirrors /[slug]/prs/page.tsx:
// header + 13-column PR table with ~10 placeholder rows.
const COLUMN_HEADERS = [
  "PR",
  "Title",
  "Size",
  "State",
  "Post-Open",
  "Churn",
  "1st Pass",
  "CI",
  "Tests",
  "Msgs",
  "Depth",
  "Cost",
  "Sessions",
];

export default function OrgPRsLoading() {
  return (
    <div>
      <SkeletonPageHeader className="mb-6" />
      <div className="rounded-xl border border-border-subtle overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-surface-1">
              {COLUMN_HEADERS.map((h) => (
                <th
                  key={h}
                  className="text-left px-4 py-2.5 text-[11px] font-medium text-text-tertiary uppercase tracking-wider"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 10 }).map((_, i) => (
              <SkeletonTableRow key={i} columns={COLUMN_HEADERS.length} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
