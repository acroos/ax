import { Skeleton } from "@/components/skeleton";

// Mirrors /[slug]/settings/page.tsx:
// header + GitHub App card + Members card + Invites card.
function SettingsCard({ rows = 3 }: { rows?: number }) {
  return (
    <div className="bg-surface-1 rounded-xl border border-border-subtle p-6 space-y-4">
      <div>
        <Skeleton className="h-4 w-40 mb-2" />
        <Skeleton className="h-3 w-72" />
      </div>
      <div className="space-y-2 pt-2">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}

export default function OrgSettingsLoading() {
  return (
    <div className="space-y-8">
      <div>
        <Skeleton className="h-6 w-56 mb-2" />
        <Skeleton className="h-4 w-64" />
      </div>

      <SettingsCard rows={2} />
      <SettingsCard rows={4} />
      <SettingsCard rows={2} />
    </div>
  );
}
