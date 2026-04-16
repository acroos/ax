import fs from "fs";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import path from "path";
import { Suspense } from "react";

import { BooleanMetricSummary } from "@/components/boolean-metric-summary";
import { Markdown } from "@/components/markdown";
import { MetricBarChart, type ChartSlot } from "@/components/metric-bar-chart";
import { SectionErrorBoundary } from "@/components/section-error-boundary";
import { Skeleton, SkeletonChartPanel } from "@/components/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { PRWithMetrics } from "@/lib/db";
import { listPRsWithMetricsAsync } from "@/lib/db";
import {
  formatMetricValue,
  getMetricDef,
  type MetricDefEntry,
} from "@/lib/metric-defs";

const metricsDir = path.join(process.cwd(), "..", "docs", "metrics");

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Map each metric category to a chart slot (THEME.md §3). Slots 1..4 are
// maximally distinguishable and cover the common case; additional categories
// extend into slots 5+.
const CATEGORY_CHART_SLOT: Record<string, ChartSlot> = {
  "Output Quality": 1,
  "Prompt Efficiency": 2,
  "Agent Behavior": 3,
  "Planning Effectiveness": 4,
};

// Extract the per-PR values for a given metric. Pulled out so the three
// async islands can each call it on the same resolved PR list without
// re-fetching.
interface PRValue {
  prId: number;
  prNumber: number;
  title: string;
  value: number;
  state: string;
}

function extractPRValues(prs: PRWithMetrics[], def: MetricDefEntry): PRValue[] {
  const values: PRValue[] = [];
  for (const pr of prs) {
    if (!pr.metrics) continue;
    const raw = pr.metrics[def.field];
    if (raw === null || raw === undefined) continue;
    values.push({
      prId: pr.id,
      prNumber: pr.number,
      title: pr.title || `PR #${pr.number}`,
      value: raw as number,
      state: pr.state || "unknown",
    });
  }
  return values;
}

export default async function MetricDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; metric: string }>;
  searchParams: Promise<{ repo?: string }>;
}) {
  const { slug, metric } = await params;
  const { repo } = await searchParams;
  const repoId = repo ? parseInt(repo, 10) : undefined;
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

  // Read markdown doc synchronously — it's local disk, so no streaming needed.
  let docContent = "";
  try {
    const filePath = path.join(metricsDir, `${def.docSlug}.md`);
    docContent = fs.readFileSync(filePath, "utf-8");
  } catch {
    // Doc file missing — not critical
  }

  const backHref = repoId ? `/${slug}?repo=${repoId}` : `/${slug}`;
  const colorSlot = CATEGORY_CHART_SLOT[def.category] ?? 1;

  // Shared PR fetch — three islands await the same promise.
  const prsPromise = listPRsWithMetricsAsync(repoId, slug).catch(
    () => [] as PRWithMetrics[],
  );

  return (
    <div>
      {/* Back link + header render synchronously — they only depend on the
          metric slug, not PR data. */}
      <Link
        href={backHref}
        className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-3.5" aria-hidden />
        Back to Overview
      </Link>

      <div className="mb-6 mt-4">
        <div className="mb-2 flex items-center gap-3">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">
            {def.label}
          </h1>
          <Badge variant="outline" className="text-muted-foreground">
            {def.category}
          </Badge>
        </div>
        <Suspense fallback={<Skeleton className="h-4 w-40" />}>
          <DataCountSubtitle promise={prsPromise} def={def} />
        </Suspense>
      </div>

      {/* Summary stats — only render for numeric metrics */}
      {def.valueType !== "boolean" && (
        <Suspense fallback={<SummaryStatsSkeleton />}>
          <SummaryStats promise={prsPromise} def={def} />
        </Suspense>
      )}

      {/* Chart panel */}
      <div className="mb-6">
        <SectionErrorBoundary
          fallback={<SkeletonChartPanel title="Per-PR Breakdown" />}
        >
          <Suspense fallback={<SkeletonChartPanel title="Per-PR Breakdown" />}>
            <ChartPanel promise={prsPromise} def={def} colorSlot={colorSlot} />
          </Suspense>
        </SectionErrorBoundary>
      </div>

      {/* Doc content renders synchronously — it's read from disk above. */}
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

async function DataCountSubtitle({
  promise,
  def,
}: {
  promise: Promise<PRWithMetrics[]>;
  def: MetricDefEntry;
}) {
  const prs = await promise;
  const values = extractPRValues(prs, def);
  return (
    <p className="text-[13px] text-muted-foreground">
      {values.length} PR{values.length !== 1 && "s"} with data
      {prs.length > values.length && (
        <span> ({prs.length - values.length} without)</span>
      )}
    </p>
  );
}

function SummaryStatsSkeleton() {
  return (
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
  );
}

async function SummaryStats({
  promise,
  def,
}: {
  promise: Promise<PRWithMetrics[]>;
  def: MetricDefEntry;
}) {
  const prs = await promise;
  const values = extractPRValues(prs, def).map((p) => p.value);
  if (values.length === 0) return null;

  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  const med = median(values);
  const min = Math.min(...values);
  const max = Math.max(...values);

  const stats = [
    { label: "Count", value: String(values.length) },
    { label: "Average", value: formatMetricValue(avg, def) },
    { label: "Median", value: formatMetricValue(med, def) },
    { label: "Min", value: formatMetricValue(min, def) },
    { label: "Max", value: formatMetricValue(max, def) },
  ];

  return (
    <div className="mb-6 grid grid-cols-5 gap-3">
      {stats.map((stat) => (
        <Card key={stat.label} className="p-4 text-center">
          <CardContent className="p-0">
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {stat.label}
            </div>
            <div className="font-mono text-[20px] font-medium text-foreground">
              {stat.value}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

async function ChartPanel({
  promise,
  def,
  colorSlot,
}: {
  promise: Promise<PRWithMetrics[]>;
  def: MetricDefEntry;
  colorSlot: ChartSlot;
}) {
  const prs = await promise;
  const values = extractPRValues(prs, def);
  const chartData = [...values]
    .sort((a, b) => a.prNumber - b.prNumber)
    .map((p) => ({
      label: `#${p.prNumber}`,
      value: p.value,
      prId: p.prId,
    }));

  return (
    <Card className="p-5">
      <CardContent className="p-0">
        <h2 className="mb-4 text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
          Per-PR Breakdown
        </h2>
        {def.valueType === "boolean" ? (
          <BooleanMetricSummary
            entries={values.map((p) => ({
              prId: p.prId,
              prNumber: p.prNumber,
              title: p.title,
              value: p.value === 1,
            }))}
            trueIsBetter={!def.lowerIsBetter}
          />
        ) : (
          <MetricBarChart
            data={chartData}
            colorSlot={colorSlot}
            unit={def.unit}
            isRatio={def.valueType === "ratio"}
          />
        )}
      </CardContent>
    </Card>
  );
}
