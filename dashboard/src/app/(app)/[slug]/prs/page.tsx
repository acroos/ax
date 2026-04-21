export const runtime = "edge";

import { Suspense } from "react";

import { listPRsWithMetricsAsync, listReposAsync } from "@/lib/db";
import type { PaginatedPRs } from "@/lib/db";
import { RepoFilter } from "@/components/repo-filter";
import { Skeleton, SkeletonTableBody } from "@/components/skeleton";
import { SectionErrorBoundary } from "@/components/section-error-boundary";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ClientTooltip } from "@/components/client-tooltip";
import { PaginatedPRTableBody } from "@/components/paginated-pr-table";

const COLUMN_COUNT = 9;

// Column-header label with a hover tooltip. Alignment is the parent
// TableHead's job; this component only provides the trigger.
function HeaderWithTip({ label, tip }: { label: string; tip: string }) {
  return (
    <ClientTooltip content={tip}>
      <span className="cursor-default">{label}</span>
    </ClientTooltip>
  );
}

// Shell renders synchronously: h1, subtitle (with a small Suspense for the
// PR count), and the full table with its header. The tbody streams in.
export default async function OrgPRsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ repo?: string }>;
}) {
  const { slug } = await params;
  const { repo } = await searchParams;
  const repoId = repo ? parseInt(repo, 10) : undefined;

  const prsPromise = listPRsWithMetricsAsync(repoId, slug);
  const reposPromise = listReposAsync(slug).catch(() => []);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">
          Pull Requests
        </h1>
        <Suspense fallback={<Skeleton className="mt-1 h-4 w-32" />}>
          <PRSubtitle
            prsPromise={prsPromise}
            reposPromise={reposPromise}
            repoId={repoId}
          />
        </Suspense>
      </div>

      <SectionErrorBoundary>
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
            <Suspense
              fallback={<SkeletonTableBody rows={10} columns={COLUMN_COUNT} />}
            >
              <PRTableBody
                promise={prsPromise}
                slug={slug}
                repoId={repoId}
              />
            </Suspense>
          </Table>
        </Card>
      </SectionErrorBoundary>
    </div>
  );
}

type RepoLite = {
  id: number;
  github_owner: string | null;
  github_repo: string | null;
};

async function PRSubtitle({
  prsPromise,
  reposPromise,
  repoId,
}: {
  prsPromise: Promise<PaginatedPRs>;
  reposPromise: Promise<RepoLite[]>;
  repoId: number | undefined;
}) {
  const [allRepos, total] = await Promise.all([
    reposPromise,
    prsPromise.then((r) => r.pagination.total).catch(() => null),
  ]);
  const repos = allRepos.filter(
    (r): r is RepoLite & { github_owner: string; github_repo: string } =>
      r.github_owner !== null && r.github_repo !== null,
  );
  return (
    <p className="mt-1 text-[13px] text-muted-foreground">
      <RepoFilter repos={repos} current={repoId} />
      {total !== null && (
        <>
          {" "}
          &middot; {total} pull request{total !== 1 ? "s" : ""}
        </>
      )}
    </p>
  );
}

async function PRTableBody({
  promise,
  slug,
  repoId,
}: {
  promise: Promise<PaginatedPRs>;
  slug: string;
  repoId: number | undefined;
}) {
  const result = await promise;
  const fetchPath = repoId
    ? `orgs/${slug}/repos/${repoId}/prs`
    : `orgs/${slug}/prs`;
  return <PaginatedPRTableBody initialData={result} fetchPath={fetchPath} />;
}
