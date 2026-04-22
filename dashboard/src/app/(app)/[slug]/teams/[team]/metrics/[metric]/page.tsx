import fs from "fs";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import path from "path";
import { Suspense } from "react";

import { Markdown } from "@/components/markdown";
import { RangeToggle, type Range } from "@/components/range-toggle";
import { SectionErrorBoundary } from "@/components/section-error-boundary";
import { Skeleton, SkeletonChartPanel } from "@/components/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { PRWithMetrics, SessionWithMetrics } from "@/lib/db";
import { listTeamPRsAsync, listTeamSessionsAsync } from "@/lib/db";
import { MetricDetailBody, BooleanPanel } from "@/components/metric-detail-content";
import { getMetricDef, type MetricDefEntry } from "@/lib/metric-defs";
import {
  extractPRValues,
  extractSessionValues,
  filterByRange,
  filterSessionsByRange,
  type PRValue,
  type SessionValue,
  type MetricValue,
} from "@/lib/metric-utils";

const metricsDir = path.join(process.cwd(), "..", "docs", "metrics");

const VALID_RANGES: Range[] = ["7d", "30d", "90d"];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function TeamMetricDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; team: string; metric: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { slug, team: teamSlug, metric } = await params;
  const { range: rangeParam } = await searchParams;
  const range: Range = VALID_RANGES.includes(rangeParam as Range)
    ? (rangeParam as Range)
    : "30d";
  const def = getMetricDef(metric);

  if (!def) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="space-y-3 text-center">
          <h2 className="text-lg font-medium text-foreground">
            Metric not found
          </h2>
          <p className="text-sm text-muted-foreground">
            No metric with slug <code className="text-primary">{metric}</code>
          </p>
        </div>
      </div>
    );
  }

  let docContent = "";
  try {
    const filePath = path.join(metricsDir, `${def.docSlug}.md`);
    docContent = fs.readFileSync(filePath, "utf-8");
  } catch {
    // Doc file missing — not critical
  }

  const backHref = `/${slug}/teams/${teamSlug}`;
  const isSession = def.source === "session";
  const dataPromise = isSession
    ? listTeamSessionsAsync(slug, teamSlug, { per_page: 100 })
        .then((r) => r.data)
        .catch(() => [] as SessionWithMetrics[])
    : listTeamPRsAsync(slug, teamSlug, { per_page: 100 })
        .then((r) => r.data)
        .catch(() => [] as PRWithMetrics[]);

  return (
    <div>
      <Link
        href={backHref}
        className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-3.5" aria-hidden />
        Back to team
      </Link>

      <div className="mb-6 mt-4">
        <div className="flex items-baseline justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">
              {def.label}
            </h1>
            <Badge variant="outline" className="text-muted-foreground">
              {def.category}
            </Badge>
          </div>
          <RangeToggle current={range} />
        </div>
        <Suspense fallback={<Skeleton className="mt-1 h-4 w-40" />}>
          <DataCountSubtitle
            promise={dataPromise}
            def={def}
            range={range}
            isSession={isSession}
          />
        </Suspense>
      </div>

      {def.valueType !== "boolean" ? (
        <SectionErrorBoundary>
          <Suspense fallback={<DataSectionsSkeleton />}>
            <MetricDataSections
              promise={dataPromise}
              def={def}
              range={range}
              slug={slug}
              isSession={isSession}
            />
          </Suspense>
        </SectionErrorBoundary>
      ) : (
        <div className="mb-6">
          <SectionErrorBoundary>
            <Suspense fallback={<SkeletonChartPanel title="Summary" />}>
              <AsyncBooleanPanel promise={dataPromise as Promise<PRWithMetrics[]>} def={def} />
            </Suspense>
          </SectionErrorBoundary>
        </div>
      )}

      {docContent && (
        <Card className="p-6">
          <CardContent className="p-0">
            <h2 className="mb-4 text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
              About This Metric
            </h2>
            <Markdown content={docContent} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Async islands
// ---------------------------------------------------------------------------

async function DataCountSubtitle({
  promise,
  def,
  range,
  isSession,
}: {
  promise: Promise<PRWithMetrics[] | SessionWithMetrics[]>;
  def: MetricDefEntry;
  range: Range;
  isSession: boolean;
}) {
  const data = await promise;
  const allValues = isSession
    ? extractSessionValues(data as SessionWithMetrics[], def)
    : extractPRValues(data as PRWithMetrics[], def);
  const values = isSession
    ? filterSessionsByRange(allValues as SessionValue[], range)
    : filterByRange(allValues as PRValue[], range);
  const itemLabel = isSession ? "session" : "PR";
  return (
    <p className="mt-1 text-[13px] text-muted-foreground">
      {values.length} {itemLabel}{values.length !== 1 && "s"} with data in past {range}
      {allValues.length > values.length && (
        <span className="text-muted-foreground/60">
          {" "}
          ({allValues.length} total)
        </span>
      )}
    </p>
  );
}

async function MetricDataSections({
  promise,
  def,
  range,
  slug,
  isSession,
}: {
  promise: Promise<PRWithMetrics[] | SessionWithMetrics[]>;
  def: MetricDefEntry;
  range: Range;
  slug: string;
  isSession: boolean;
}) {
  const data = await promise;
  const allValues: MetricValue[] = isSession
    ? extractSessionValues(data as SessionWithMetrics[], def)
    : extractPRValues(data as PRWithMetrics[], def);
  const values: MetricValue[] = isSession
    ? filterSessionsByRange(allValues as SessionValue[], range)
    : filterByRange(allValues as PRValue[], range);

  if (values.length === 0) {
    return (
      <div className="mb-6 flex h-40 items-center justify-center rounded-lg border border-dashed border-border text-[13px] text-muted-foreground">
        No data for this metric in the selected period.
      </div>
    );
  }

  return (
    <MetricDetailBody
      values={values}
      allValues={allValues}
      def={def}
      range={range}
      prHref={isSession ? undefined : (prId) => `/${slug}/prs/${prId}`}
    />
  );
}

async function AsyncBooleanPanel({
  promise,
  def,
}: {
  promise: Promise<PRWithMetrics[]>;
  def: MetricDefEntry;
}) {
  const prs = await promise;
  const values = extractPRValues(prs, def);
  return <BooleanPanel values={values} def={def} />;
}

// ---------------------------------------------------------------------------
// Skeletons
// ---------------------------------------------------------------------------

function DataSectionsSkeleton() {
  return (
    <>
      {/* Stats */}
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
      {/* Chart */}
      <Card className="mb-6 p-5">
        <CardContent className="p-0">
          <Skeleton className="mb-4 h-3 w-20" />
          <Skeleton className="h-[280px] w-full" />
        </CardContent>
      </Card>
      {/* Distribution + Notable PRs */}
      <div className="mb-6 grid grid-cols-2 gap-3">
        <Card className="p-5">
          <CardContent className="p-0">
            <Skeleton className="mb-4 h-3 w-28" />
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-5 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
        <Card className="p-5">
          <CardContent className="p-0">
            <Skeleton className="mb-4 h-3 w-24" />
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-5 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
