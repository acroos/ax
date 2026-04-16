import { Skeleton } from "@/components/skeleton";

// Mirrors /settings/page.tsx (account):
// header + Profile card + API Key card + Session card.
export default function AccountSettingsLoading() {
  return (
    <div className="space-y-8">
      <div>
        <Skeleton className="h-6 w-32 mb-2" />
        <Skeleton className="h-4 w-64" />
      </div>

      {/* Profile */}
      <div className="bg-surface-1 rounded-xl border border-border-subtle p-6 space-y-4">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-3 w-56" />
        <div className="flex items-center gap-4 pt-1">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
      </div>

      {/* API Key */}
      <div className="bg-surface-1 rounded-xl border border-border-subtle p-6 space-y-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3 w-80" />
        <Skeleton className="h-10 w-full" />
      </div>

      {/* Session */}
      <div className="bg-surface-1 rounded-xl border border-border-subtle p-6 space-y-4">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-3 w-72" />
        <Skeleton className="h-9 w-24" />
      </div>
    </div>
  );
}
