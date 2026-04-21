import Link from "next/link";
import { getMockTeamPRs, getMockTeamDetail } from "@/lib/mock/data";
import { Card } from "@/components/ui/card";
import { Table } from "@/components/ui/table";
import { PRTableHeader } from "@/components/pr-table-header";
import { DemoPaginatedPRTableBody } from "@/components/demo-paginated-pr-table";

export default async function DemoTeamPRsPage({
  params,
}: {
  params: Promise<{ team: string }>;
}) {
  const { team: teamSlug } = await params;
  const detail = getMockTeamDetail(teamSlug);
  const prs = getMockTeamPRs(teamSlug);

  return (
    <div>
      <div className="mb-6">
        <Link
          href={`/demo/teams/${teamSlug}`}
          className="text-[13px] text-primary transition-colors hover:underline"
        >
          &larr; {detail?.name ?? "Team"}
        </Link>
        <h1 className="mt-2 text-[22px] font-semibold tracking-[-0.02em] text-foreground">
          Pull Requests
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {prs.length} pull request{prs.length !== 1 ? "s" : ""} by{" "}
          {detail?.name} members
        </p>
      </div>

      <Card className="gap-0 overflow-hidden p-0">
        <Table>
          <PRTableHeader />
          <DemoPaginatedPRTableBody allPrs={prs} />
        </Table>
      </Card>
    </div>
  );
}
