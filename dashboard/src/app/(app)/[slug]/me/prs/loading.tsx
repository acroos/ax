import { SkeletonPageHeader, SkeletonTableRow } from "@/components/skeleton";
import { Card } from "@/components/ui/card";
import { Table, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const COLUMN_HEADERS = [
  "PR",
  "Title",
  "Size",
  "State",
  "Post-Open",
  "CI",
  "Depth",
  "Cost",
  "Sessions",
];

export default function MyPRsLoading() {
  return (
    <div>
      <SkeletonPageHeader className="mb-6" />
      <Card className="gap-0 overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              {COLUMN_HEADERS.map((h) => (
                <TableHead key={h}>{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <tbody>
            {Array.from({ length: 10 }).map((_, i) => (
              <SkeletonTableRow key={i} columns={COLUMN_HEADERS.length} />
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
