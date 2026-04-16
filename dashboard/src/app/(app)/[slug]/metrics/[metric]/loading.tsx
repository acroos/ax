import { Skeleton } from "@/components/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Mirrors /[slug]/metrics/[metric]/page.tsx:
// back link + header + 5 summary stat cards + chart panel + PR table + doc card.
export default function MetricDetailLoading() {
  return (
    <div>
      {/* Back link */}
      <Skeleton className="mb-6 h-4 w-32" />

      {/* Header */}
      <div className="mb-6 mt-4">
        <div className="mb-2 flex items-center gap-3">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-5 w-28 rounded-full" />
        </div>
        <Skeleton className="h-4 w-40" />
      </div>

      {/* Summary stats: Count / Avg / Median / Min / Max */}
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

      {/* Chart panel */}
      <Card className="mb-6 p-5">
        <CardContent className="p-0">
          <Skeleton className="mb-4 h-3 w-40" />
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>

      {/* PR table */}
      <Card className="mb-6 gap-0 overflow-hidden p-0">
        <div className="border-b border-border px-5 py-3">
          <Skeleton className="h-3 w-56" />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              {["PR", "Title", "Value", "State"].map((h) => (
                <TableHead key={h}>
                  <Skeleton className="h-3 w-12" />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 8 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell>
                  <Skeleton className="h-4 w-10" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-full max-w-[280px]" />
                </TableCell>
                <TableCell>
                  <Skeleton className="ml-auto h-4 w-12" />
                </TableCell>
                <TableCell>
                  <Skeleton className="mx-auto h-5 w-16 rounded-full" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

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
