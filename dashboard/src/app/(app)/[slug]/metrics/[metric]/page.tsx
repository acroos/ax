import fs from "fs";
import path from "path";
import Link from "next/link";
import { Suspense } from "react";
import { listPRsWithMetricsAsync } from "@/lib/db";
import type { PRWithMetrics } from "@/lib/db";
import { getMetricDef, formatMetricValue, type MetricDefEntry } from "@/lib/metric-defs";
import { Markdown } from "@/components/markdown";
import { MetricBarChart } from "@/components/metric-bar-chart";
import { BooleanMetricSummary } from "@/components/boolean-metric-summary";
import { Skeleton, SkeletonChartPanel } from "@/components/skeleton";
import { SectionErrorBoundary } from "@/components/section-error-boundary";

const metricsDir = path.join(process.cwd(), "..", "docs", "metrics");

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

const CHART_COLORS: Record<string, string> = {
  "Output Quality": "#34D399",
  "Prompt Efficiency": "#6366F1",
  "Agent Behavior": "#F59E0B",
  "Planning Effectiveness": "#A78BFA",
};

const CATEGORY_BADGE_COLORS: Record<string, string> = {
  "Output Quality": "bg-green-muted text-green",
  "Prompt Efficiency": "bg-accent-muted text-accent",
  "Agent Behavior": "bg-amber-muted text-amber",
  "Planning Effectiveness": "bg-purple-muted text-purple",
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
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center space-y-3">
          <h2 className="text-text-primary text-lg font-medium">Metric not found</h2>
          <p className="text-text-secondary text-sm">
            No metric with slug <code className="text-accent">{metric}</code>
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
  const badgeColor =
    CATEGORY_BADGE_COLORS[def.category] || "bg-surface-3 text-text-tertiary";
  const chartColor = CHART_COLORS[def.category] || "#6366F1";

  // Shared PR fetch — three islands await the same promise.
  const prsPromise = listPRsWithMetricsAsync(repoId, slug).catch(() => [] as PRWithMetrics[]);

  return (
    <div>
      {/* Back link + header render synchronously — they only depend on the
          metric slug, not PR data. */}
      <Link
        href={backHref}
        className="text-accent hover:underline text-[13px] mb-6 inline-flex items-center gap-1.5"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path
            d="M8.5 3.5L5 7L8.5 10.5"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Back to Overview
      </Link>

      <div className="mb-6 mt-4 animate-in">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-[22px] font-semibold text-text-primary tracking-[-0.02em]">
            {def.label}
          </h1>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${badgeColor}`}>
            {def.category}
          </span>
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
      <div className="mb-6 animate-in" style={{ animationDelay: "100ms" }}>
        <SectionErrorBoundary fallback={<SkeletonChartPanel title="Per-PR Breakdown" />}>
          <Suspense fallback={<SkeletonChartPanel title="Per-PR Breakdown" />}>
            <ChartPanel promise={prsPromise} def={def} chartColor={chartColor} />
          </Suspense>
        </SectionErrorBoundary>
      </div>

      {/* PR table */}
      <Suspense fallback={<PRTableSkeleton def={def} />}>
        <PRTable promise={prsPromise} def={def} />
      </Suspense>

      {/* Doc content renders synchronously — it's read from disk above. */}
      {docContent && (
        <div
          className="rounded-xl border border-border-subtle bg-surface-1 p-6 animate-in"
          style={{ animationDelay: "200ms" }}
        >
          <h2 className="text-[12px] font-medium text-text-tertiary uppercase tracking-wider mb-4">
            About This Metric
          </h2>
          <Markdown content={docContent} />
        </div>
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
    <p className="text-[13px] text-text-secondary">
      {values.length} PR{values.length !== 1 && "s"} with data
      {prs.length > values.length && (
        <span className="text-text-tertiary">
          {" "}({prs.length - values.length} without)
        </span>
      )}
    </p>
  );
}

function SummaryStatsSkeleton() {
  return (
    <div className="grid grid-cols-5 gap-3 mb-6">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-border-subtle bg-surface-1 p-4 text-center"
        >
          <Skeleton className="h-3 w-16 mx-auto mb-2" />
          <Skeleton className="h-5 w-12 mx-auto" />
        </div>
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
    <div
      className="grid grid-cols-5 gap-3 mb-6 animate-in"
      style={{ animationDelay: "50ms" }}
    >
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="rounded-xl border border-border-subtle bg-surface-1 p-4 text-center"
        >
          <div className="text-[11px] font-medium text-text-tertiary uppercase tracking-wider mb-1">
            {stat.label}
          </div>
          <div className="font-mono text-[20px] font-medium text-text-primary">
            {stat.value}
          </div>
        </div>
      ))}
    </div>
  );
}

async function ChartPanel({
  promise,
  def,
  chartColor,
}: {
  promise: Promise<PRWithMetrics[]>;
  def: MetricDefEntry;
  chartColor: string;
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
    <div className="rounded-xl border border-border-subtle bg-surface-1 p-5">
      <h2 className="text-[12px] font-medium text-text-tertiary uppercase tracking-wider mb-4">
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
          color={chartColor}
          unit={def.unit}
          isRatio={def.valueType === "ratio"}
        />
      )}
    </div>
  );
}

function PRTableSkeleton({ def }: { def: MetricDefEntry }) {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-1 overflow-hidden mb-6">
      <div className="px-5 py-3 border-b border-border-subtle">
        <h2 className="text-[12px] font-medium text-text-tertiary uppercase tracking-wider">
          All PRs — sorted by {def.label.toLowerCase()}
        </h2>
      </div>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-text-tertiary text-left border-b border-border-subtle">
            <th className="px-5 py-2 font-medium">PR</th>
            <th className="px-5 py-2 font-medium">Title</th>
            <th className="px-5 py-2 font-medium text-right">{def.label}</th>
            <th className="px-5 py-2 font-medium text-center">State</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 8 }).map((_, i) => (
            <tr key={i} className="border-b border-border-subtle/50 last:border-0">
              <td className="px-5 py-2.5"><Skeleton className="h-4 w-10" /></td>
              <td className="px-5 py-2.5"><Skeleton className="h-4 w-full max-w-[280px]" /></td>
              <td className="px-5 py-2.5"><Skeleton className="h-4 w-12 ml-auto" /></td>
              <td className="px-5 py-2.5"><Skeleton className="h-5 w-16 rounded-full mx-auto" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function PRTable({
  promise,
  def,
}: {
  promise: Promise<PRWithMetrics[]>;
  def: MetricDefEntry;
}) {
  const prs = await promise;
  const values = extractPRValues(prs, def);
  const sorted = [...values].sort((a, b) =>
    def.lowerIsBetter ? a.value - b.value : b.value - a.value
  );

  if (sorted.length === 0) return null;

  return (
    <div
      className="rounded-xl border border-border-subtle bg-surface-1 overflow-hidden mb-6 animate-in"
      style={{ animationDelay: "150ms" }}
    >
      <div className="px-5 py-3 border-b border-border-subtle">
        <h2 className="text-[12px] font-medium text-text-tertiary uppercase tracking-wider">
          All PRs — sorted by {def.label.toLowerCase()}
        </h2>
      </div>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-text-tertiary text-left border-b border-border-subtle">
            <th className="px-5 py-2 font-medium">PR</th>
            <th className="px-5 py-2 font-medium">Title</th>
            <th className="px-5 py-2 font-medium text-right">{def.label}</th>
            <th className="px-5 py-2 font-medium text-center">State</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((pr) => (
            <tr
              key={pr.prId}
              className="border-b border-border-subtle/50 last:border-0 hover:bg-surface-2/50 transition-colors"
            >
              <td className="px-5 py-2.5">
                <Link
                  href={`/prs/${pr.prId}`}
                  className="font-mono text-accent hover:text-text-primary transition-colors"
                >
                  #{pr.prNumber}
                </Link>
              </td>
              <td className="px-5 py-2.5 text-text-primary truncate max-w-[400px]">
                <Link
                  href={`/prs/${pr.prId}`}
                  className="hover:text-accent transition-colors"
                >
                  {pr.title}
                </Link>
              </td>
              <td className="px-5 py-2.5 text-right font-mono text-text-secondary">
                {formatMetricValue(pr.value, def)}
              </td>
              <td className="px-5 py-2.5 text-center">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                  pr.state === "merged"
                    ? "bg-purple-muted text-purple"
                    : pr.state === "closed"
                      ? "bg-red-muted text-red"
                      : "bg-surface-3 text-text-tertiary"
                }`}>
                  {pr.state}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
