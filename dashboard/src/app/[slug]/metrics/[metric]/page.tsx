import fs from "fs";
import path from "path";
import Link from "next/link";
import { listPRsWithMetricsAsync } from "@/lib/db";
import type { PRWithMetrics } from "@/lib/db";
import { METRIC_DEFS, getMetricDef, formatMetricValue } from "@/lib/metric-defs";
import { Markdown } from "@/components/markdown";
import { MetricBarChart } from "@/components/metric-bar-chart";
import { BooleanMetricSummary } from "@/components/boolean-metric-summary";

const metricsDir = path.join(process.cwd(), "..", "docs", "metrics");

export function generateStaticParams() {
  return METRIC_DEFS.map((d) => ({ metric: d.slug }));
}

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

  // Fetch PR data
  let prs: PRWithMetrics[] = [];
  try {
    prs = await listPRsWithMetricsAsync(repoId, slug);
  } catch {
    // API not available
  }

  // Extract per-PR values for this metric
  const prValues: { prId: number; prNumber: number; title: string; value: number; state: string }[] = [];
  for (const pr of prs) {
    if (!pr.metrics) continue;
    const raw = pr.metrics[def.field];
    if (raw === null || raw === undefined) continue;
    prValues.push({
      prId: pr.id,
      prNumber: pr.number,
      title: pr.title || `PR #${pr.number}`,
      value: raw as number,
      state: pr.state || "unknown",
    });
  }

  // Sort by value (descending for "higher is better", ascending for "lower is better")
  const sorted = [...prValues].sort((a, b) =>
    def.lowerIsBetter ? a.value - b.value : b.value - a.value
  );

  // Summary stats
  const values = prValues.map((p) => p.value);
  const count = values.length;
  const avg = count > 0 ? values.reduce((s, v) => s + v, 0) / count : 0;
  const med = median(values);
  const min = count > 0 ? Math.min(...values) : 0;
  const max = count > 0 ? Math.max(...values) : 0;

  // Read markdown doc
  let docContent = "";
  try {
    const filePath = path.join(metricsDir, `${def.docSlug}.md`);
    docContent = fs.readFileSync(filePath, "utf-8");
  } catch {
    // Doc file missing — not critical
  }

  // Build chart data
  const chartData = prValues
    .sort((a, b) => a.prNumber - b.prNumber)
    .map((p) => ({
      label: `#${p.prNumber}`,
      value: p.value,
      prId: p.prId,
    }));

  const chartColor = CHART_COLORS[def.category] || "#6366F1";
  const badgeColor = CATEGORY_BADGE_COLORS[def.category] || "bg-surface-3 text-text-tertiary";

  const backHref = repoId ? `/${slug}?repo=${repoId}` : `/${slug}`;

  return (
    <div>
      {/* Back link */}
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

      {/* Header */}
      <div className="mb-6 mt-4 animate-in">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-[22px] font-semibold text-text-primary tracking-[-0.02em]">
            {def.label}
          </h1>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${badgeColor}`}>
            {def.category}
          </span>
        </div>
        <p className="text-[13px] text-text-secondary">
          {count} PR{count !== 1 && "s"} with data
          {prs.length > count && (
            <span className="text-text-tertiary">
              {" "}({prs.length - count} without)
            </span>
          )}
        </p>
      </div>

      {/* Summary stats */}
      {count > 0 && def.valueType !== "boolean" && (
        <div
          className="grid grid-cols-5 gap-3 mb-6 animate-in"
          style={{ animationDelay: "50ms" }}
        >
          {[
            { label: "Count", value: String(count) },
            { label: "Average", value: formatMetricValue(avg, def) },
            { label: "Median", value: formatMetricValue(med, def) },
            { label: "Min", value: formatMetricValue(min, def) },
            { label: "Max", value: formatMetricValue(max, def) },
          ].map((stat) => (
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
      )}

      {/* Chart */}
      <div
        className="rounded-xl border border-border-subtle bg-surface-1 p-5 mb-6 animate-in"
        style={{ animationDelay: "100ms" }}
      >
        <h2 className="text-[12px] font-medium text-text-tertiary uppercase tracking-wider mb-4">
          Per-PR Breakdown
        </h2>
        {def.valueType === "boolean" ? (
          <BooleanMetricSummary
            entries={prValues.map((p) => ({
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

      {/* PR table */}
      {sorted.length > 0 && (
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
      )}

      {/* About this metric */}
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
