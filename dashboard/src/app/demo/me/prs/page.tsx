import Link from "next/link";
import { getMockMyPRs } from "@/lib/mock/data";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ClientTooltip } from "@/components/client-tooltip";
import { DemoPaginatedPRTableBody } from "@/components/demo-paginated-pr-table";

function HeaderWithTip({ label, tip }: { label: string; tip: string }) {
  return (
    <ClientTooltip content={tip}>
      <span className="cursor-default">{label}</span>
    </ClientTooltip>
  );
}

export default async function DemoMyPRsPage() {
  const prs = getMockMyPRs();

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/demo/me"
          className="text-[13px] text-primary transition-colors hover:underline"
        >
          &larr; My Dashboard
        </Link>
        <h1 className="mt-2 text-[22px] font-semibold tracking-[-0.02em] text-foreground">
          My Pull Requests
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {prs.length} pull request{prs.length !== 1 ? "s" : ""}
        </p>
      </div>

      <Card className="gap-0 overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>PR</TableHead>
              <TableHead>Title</TableHead>
              <TableHead className="text-center">Size</TableHead>
              <TableHead className="text-center">State</TableHead>
              <TableHead className="text-center">
                <HeaderWithTip label="Post-Open" tip="Commits after PR opened" />
              </TableHead>
              <TableHead className="text-center">
                <HeaderWithTip label="CI" tip="CI checks passing rate" />
              </TableHead>
              <TableHead className="text-center">
                <HeaderWithTip label="Depth" tip="Human-agent turn pairs" />
              </TableHead>
              <TableHead className="text-right">
                <HeaderWithTip label="Cost" tip="Token cost in dollars" />
              </TableHead>
              <TableHead className="text-center">
                <HeaderWithTip label="Sessions" tip="Agent sessions linked to this PR" />
              </TableHead>
            </TableRow>
          </TableHeader>
          <DemoPaginatedPRTableBody allPrs={prs} />
        </Table>
      </Card>
    </div>
  );
}
