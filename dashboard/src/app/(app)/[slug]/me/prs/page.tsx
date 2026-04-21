export const runtime = "edge";

import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeft } from "lucide-react";

import { listMyPRsAsync } from "@/lib/db";
import type { PaginatedPRs } from "@/lib/db";
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

function HeaderWithTip({ label, tip }: { label: string; tip: string }) {
  return (
    <ClientTooltip content={tip}>
      <span className="cursor-default">{label}</span>
    </ClientTooltip>
  );
}

export default async function MyPRsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const prsPromise = listMyPRsAsync(slug);

  return (
    <div>
      <Link
        href={`/${slug}/me`}
        className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-3.5" aria-hidden />
        Back to My Dashboard
      </Link>

      <div className="mb-6">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">
          My Pull Requests
        </h1>
        <Suspense fallback={<Skeleton className="mt-1 h-4 w-32" />}>
          <PRCount promise={prsPromise} />
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
              <PRTableBody promise={prsPromise} slug={slug} />
            </Suspense>
          </Table>
        </Card>
      </SectionErrorBoundary>
    </div>
  );
}

async function PRCount({ promise }: { promise: Promise<PaginatedPRs> }) {
  let total: number | null = null;
  try {
    const result = await promise;
    total = result.pagination.total;
  } catch {
    // Error is surfaced by the table body's error boundary below.
  }
  return (
    <p className="mt-1 text-[13px] text-muted-foreground">
      {total === null
        ? "Unable to load pull requests"
        : `${total} pull request${total !== 1 ? "s" : ""}`}
    </p>
  );
}

async function PRTableBody({
  promise,
  slug,
}: {
  promise: Promise<PaginatedPRs>;
  slug: string;
}) {
  const result = await promise;
  return (
    <PaginatedPRTableBody
      initialData={result}
      fetchPath={`orgs/${slug}/me/prs`}
    />
  );
}
