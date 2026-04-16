import { Skeleton } from "@/components/skeleton";
import { Card, CardContent } from "@/components/ui/card";

// Mirrors /[slug]/settings/page.tsx:
// header + GitHub App card + Members card + Invites card.
function SettingsCard({ rows = 3 }: { rows?: number }) {
  return (
    <Card className="p-6">
      <CardContent className="space-y-4 p-0">
        <div>
          <Skeleton className="mb-2 h-4 w-40" />
          <Skeleton className="h-3 w-72" />
        </div>
        <div className="space-y-2 pt-2">
          {Array.from({ length: rows }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function OrgSettingsLoading() {
  return (
    <div className="space-y-8">
      <div>
        <Skeleton className="mb-2 h-6 w-56" />
        <Skeleton className="h-4 w-64" />
      </div>

      <SettingsCard rows={2} />
      <SettingsCard rows={4} />
      <SettingsCard rows={2} />
    </div>
  );
}
