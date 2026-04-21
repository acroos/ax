import { MOCK_PRS, MOCK_REPOS } from "@/lib/mock/data";
import { RepoFilter } from "@/components/repo-filter";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ClientTooltip } from "@/components/client-tooltip";
import { DemoPaginatedPRTableBody } from "@/components/demo-paginated-pr-table";

const DEMO_REPOS = MOCK_REPOS.filter(
  (r): r is typeof r & { github_owner: string; github_repo: string } =>
    r.github_owner !== null && r.github_repo !== null,
);

function HeaderWithTip({ label, tip }: { label: string; tip: string }) {
  return (
    <ClientTooltip content={tip}>
      <span className="cursor-default">{label}</span>
    </ClientTooltip>
  );
}

export default async function DemoPRsPage({
  searchParams,
}: {
  searchParams: Promise<{ repo?: string }>;
}) {
  const { repo } = await searchParams;
  const repoId = repo ? parseInt(repo, 10) : undefined;
  const prs = repoId
    ? MOCK_PRS.filter((p) => p.repo_id === repoId)
    : MOCK_PRS;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">
          Pull Requests
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          <RepoFilter repos={DEMO_REPOS} current={repoId} />
          {" "}&middot; {prs.length} pull request{prs.length !== 1 ? "s" : ""}
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
                <HeaderWithTip
                  label="Post-Open"
                  tip="Commits after PR opened"
                />
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
                <HeaderWithTip
                  label="Sessions"
                  tip="Agent sessions linked to this PR"
                />
              </TableHead>
            </TableRow>
          </TableHeader>
          <DemoPaginatedPRTableBody allPrs={prs} />
        </Table>
      </Card>
    </div>
  );
}
