export const runtime = "edge";

import Link from "next/link";
import { getMockTeamPRs, getMockTeamDetail } from "@/lib/mock/data";
import { getPRSize } from "@/lib/db";
import { StateBadge } from "@/components/state-badge";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ClientTooltip } from "@/components/client-tooltip";

function HeaderWithTip({ label, tip }: { label: string; tip: string }) {
  return (
    <ClientTooltip content={tip}>
      <span className="cursor-default">{label}</span>
    </ClientTooltip>
  );
}

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
          <TableBody>
            {prs.map((pr) => (
              <TableRow key={pr.id}>
                <TableCell>
                  <span className="font-mono text-[13px] text-primary">
                    #{pr.number}
                  </span>
                  {pr.github_owner && (
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {pr.github_owner}/{pr.github_repo}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <span className="line-clamp-1 text-[13px] text-foreground">
                    {pr.title ?? "Untitled"}
                  </span>
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant="outline" className="font-mono">
                    {getPRSize(pr.additions, pr.deletions)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-center gap-1.5">
                    <StateBadge state={pr.state} />
                  </div>
                </TableCell>
                <TableCell className="text-center font-mono text-[13px] text-muted-foreground">
                  {pr.metrics?.post_open_commits ?? "\u2014"}
                </TableCell>
                <TableCell className="text-center font-mono text-[13px] text-muted-foreground">
                  {pr.metrics?.ci_success_rate !== null &&
                  pr.metrics?.ci_success_rate !== undefined
                    ? `${Math.round(pr.metrics.ci_success_rate * 100)}%`
                    : "\u2014"}
                </TableCell>
                <TableCell className="text-center font-mono text-[13px] text-muted-foreground">
                  {pr.metrics?.iteration_depth ?? "\u2014"}
                </TableCell>
                <TableCell className="text-right font-mono text-[13px] text-muted-foreground">
                  {pr.metrics?.token_cost_usd !== null &&
                  pr.metrics?.token_cost_usd !== undefined
                    ? `$${pr.metrics.token_cost_usd.toFixed(2)}`
                    : "\u2014"}
                </TableCell>
                <TableCell className="text-center">
                  {pr.session_count > 0 ? (
                    <Badge variant="secondary" className="font-mono">
                      {pr.session_count}
                    </Badge>
                  ) : (
                    <span className="text-[13px] text-muted-foreground">
                      &#8212;
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
