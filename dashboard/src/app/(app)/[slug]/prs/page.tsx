import Link from "next/link";
import { Suspense } from "react";

import { listPRsWithMetricsAsync, getPRSize } from "@/lib/db";
import type { PRWithMetrics } from "@/lib/db";
import { Skeleton, SkeletonTableBody } from "@/components/skeleton";
import { SectionErrorBoundary } from "@/components/section-error-boundary";
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

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">
          Pull Requests
        </h1>
        <Suspense fallback={<Skeleton className="mt-1 h-4 w-32" />}>
          <PRCount promise={prsPromise} />
        </Suspense>
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
          <SectionErrorBoundary fallback={<NoDataBody />}>
            <Suspense
              fallback={<SkeletonTableBody rows={10} columns={COLUMN_COUNT} />}
            >
              <PRTableBody promise={prsPromise} />
            </Suspense>
          </SectionErrorBoundary>
        </Table>
      </Card>
    </div>
  );
}

async function PRCount({ promise }: { promise: Promise<PRWithMetrics[]> }) {
  let count: number | null = null;
  try {
    const prs = await promise;
    count = prs.length;
  } catch {
    // Error is surfaced by the table body's error boundary below.
  }
  return (
    <p className="mt-1 text-[13px] text-muted-foreground">
      {count === null
        ? "Unable to load pull requests"
        : `${count} pull request${count !== 1 ? "s" : ""}`}
    </p>
  );
}

// Error-state must render as a <TableBody> so it slots into the Table
// shell rather than replacing the whole page.
function NoDataBody() {
  return (
    <TableBody>
      <TableRow>
        <TableCell colSpan={COLUMN_COUNT} className="px-4 py-16 text-center">
          <h2 className="mb-1 text-sm font-medium text-foreground">
            No data yet
          </h2>
          <p className="text-[13px] text-muted-foreground">
            Connect a repository to start tracking metrics.
          </p>
        </TableCell>
      </TableRow>
    </TableBody>
  );
}

async function PRTableBody({ promise }: { promise: Promise<PRWithMetrics[]> }) {
  const prs = await promise;
  return (
    <TableBody>
      {prs.map((pr) => (
        <TableRow key={pr.id}>
          <TableCell>
            <Link
              href={`/prs/${pr.id}`}
              className="font-mono text-[13px] text-primary transition-colors hover:underline"
            >
              #{pr.number}
            </Link>
            {pr.github_owner && (
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                {pr.github_owner}/{pr.github_repo}
              </div>
            )}
          </TableCell>
          <TableCell>
            <Link
              href={`/prs/${pr.id}`}
              className="line-clamp-1 text-[13px] text-foreground transition-colors hover:text-primary"
            >
              {pr.title ?? "Untitled"}
            </Link>
          </TableCell>
          <TableCell className="text-center">
            <Badge variant="outline" className="font-mono">
              {getPRSize(pr.additions, pr.deletions)}
            </Badge>
          </TableCell>
          <TableCell>
            <div className="flex items-center justify-center gap-1.5">
              <StateBadge state={pr.state} />
              {pr.metrics && !pr.metrics.metrics_finalized && (
                <span
                  className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-notice"
                  title="Metrics pending"
                />
              )}
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
              <span className="text-[13px] text-muted-foreground">&#8212;</span>
            )}
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  );
}
