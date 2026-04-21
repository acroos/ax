export const runtime = "edge";

import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeft } from "lucide-react";

import { listTeamPRsAsync, getTeamAsync } from "@/lib/db";
import type { PaginatedPRs } from "@/lib/db";
import { Skeleton, SkeletonTableBody } from "@/components/skeleton";
import { SectionErrorBoundary } from "@/components/section-error-boundary";
import { Card } from "@/components/ui/card";
import { Table } from "@/components/ui/table";
import { PRTableHeader } from "@/components/pr-table-header";
import { PaginatedPRTableBody } from "@/components/paginated-pr-table";

const COLUMN_COUNT = 9;

export default async function TeamPRsPage({
  params,
}: {
  params: Promise<{ slug: string; team: string }>;
}) {
  const { slug, team: teamSlug } = await params;

  const prsPromise = listTeamPRsAsync(slug, teamSlug);
  const teamPromise = getTeamAsync(slug, teamSlug).catch(() => null);

  return (
    <div>
      <Link
        href={`/${slug}/teams/${teamSlug}`}
        className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-3.5" aria-hidden />
        Back to team
      </Link>

      <div className="mb-6">
        <Suspense fallback={<Skeleton className="h-7 w-48" />}>
          <TeamPRsTitle teamPromise={teamPromise} />
        </Suspense>
        <Suspense fallback={<Skeleton className="mt-1 h-4 w-32" />}>
          <PRCount promise={prsPromise} />
        </Suspense>
      </div>

      <SectionErrorBoundary>
        <Card className="gap-0 overflow-hidden p-0">
          <Table>
            <PRTableHeader />
            <Suspense
              fallback={<SkeletonTableBody rows={10} columns={COLUMN_COUNT} />}
            >
              <PRTableBody promise={prsPromise} slug={slug} teamSlug={teamSlug} />
            </Suspense>
          </Table>
        </Card>
      </SectionErrorBoundary>
    </div>
  );
}

async function TeamPRsTitle({
  teamPromise,
}: {
  teamPromise: Promise<{ name: string } | null>;
}) {
  const team = await teamPromise;
  return (
    <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">
      {team ? `${team.name} — Pull Requests` : "Pull Requests"}
    </h1>
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
  teamSlug,
}: {
  promise: Promise<PaginatedPRs>;
  slug: string;
  teamSlug: string;
}) {
  const result = await promise;
  return (
    <PaginatedPRTableBody
      initialData={result}
      fetchPath={`orgs/${slug}/teams/${teamSlug}/prs`}
    />
  );
}
