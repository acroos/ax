import type { MetricAggregate } from "@/lib/db";
import { METRIC_DEFS } from "@/lib/metric-defs";
import { SectionDivider } from "@/components/section-divider";
import { MetricCard, fmt, fmtPct, fmtCost, fmtDelta } from "@/components/metric-card";
import type { Range } from "@/components/range-toggle";

const METRIC_INFO = Object.fromEntries(METRIC_DEFS.map((d) => [d.slug, d]));

export function OverviewMetricsGrid({
  metrics,
  range,
  metricHref,
}: {
  metrics: Record<string, MetricAggregate>;
  range: Range;
  metricHref: (slug: string) => string;
}) {
  const m = (slug: string) => metrics[slug]?.current ?? null;
  const prior = (slug: string) => metrics[slug]?.prior ?? null;
  const spark = (slug: string) => metrics[slug]?.sparkline;
  const tip = (slug: string) => {
    const def = METRIC_INFO[slug];
    return def ? { tooltip: def.tooltip } : {};
  };

  return (
    <>
      {/* Output Quality */}
      <div className="mb-8">
        <SectionDivider label="Output Quality" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <MetricCard
            label="Avg Post-Open Commits"
            value={fmt(m("post-open-commits"))}
            delta={fmtDelta(m("post-open-commits"), prior("post-open-commits"), (n) => fmt(n), range)}
            sparkline={spark("post-open-commits")}
            href={metricHref("post-open-commits")}
            {...tip("post-open-commits")}
          />
          <MetricCard
            label="CI Success Rate"
            value={fmtPct(m("ci-success-rate"))}
            delta={fmtDelta(m("ci-success-rate"), prior("ci-success-rate"), fmtPct, range)}
            sparkline={spark("ci-success-rate")}
            href={metricHref("ci-success-rate")}
            {...tip("ci-success-rate")}
          />
          <MetricCard
            label="Avg Line Revisit Rate"
            value={fmt(m("line-revisit-rate"), 2)}
            delta={fmtDelta(m("line-revisit-rate"), prior("line-revisit-rate"), (n) => fmt(n, 2), range)}
            sparkline={spark("line-revisit-rate")}
            href={metricHref("line-revisit-rate")}
            {...tip("line-revisit-rate")}
          />
        </div>
      </div>

      {/* Prompt Efficiency */}
      <div className="mb-8">
        <SectionDivider label="Prompt Efficiency" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <MetricCard
            label="Avg Iteration Depth"
            value={fmt(m("iteration-depth"), 0)}
            delta={fmtDelta(m("iteration-depth"), prior("iteration-depth"), (n) => fmt(n, 0), range)}
            sparkline={spark("iteration-depth")}
            href={metricHref("iteration-depth")}
            {...tip("iteration-depth")}
          />
          <MetricCard
            label="Avg Token Cost"
            value={fmtCost(m("token-cost-per-pr"))}
            delta={fmtDelta(m("token-cost-per-pr"), prior("token-cost-per-pr"), fmtCost, range)}
            sparkline={spark("token-cost-per-pr")}
            href={metricHref("token-cost-per-pr")}
            {...tip("token-cost-per-pr")}
          />
          <MetricCard
            label="Avg Cache Hit Rate"
            value={fmtPct(m("cache-hit-rate"))}
            delta={fmtDelta(m("cache-hit-rate"), prior("cache-hit-rate"), fmtPct, range)}
            sparkline={spark("cache-hit-rate")}
            href={metricHref("cache-hit-rate")}
            {...tip("cache-hit-rate")}
          />
        </div>
      </div>

      {/* Agent Behavior */}
      <div className="mb-8">
        <SectionDivider label="Agent Behavior" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <MetricCard
            label="Avg Sidechain Rate"
            value={fmtPct(m("sidechain-rate"))}
            delta={fmtDelta(m("sidechain-rate"), prior("sidechain-rate"), fmtPct, range)}
            sparkline={spark("sidechain-rate")}
            href={metricHref("sidechain-rate")}
            {...tip("sidechain-rate")}
          />
          <MetricCard
            label="Avg Re-Read Rate"
            value={fmt(m("re-read-rate"), 2)}
            delta={fmtDelta(m("re-read-rate"), prior("re-read-rate"), (n) => fmt(n, 2), range)}
            sparkline={spark("re-read-rate")}
            href={metricHref("re-read-rate")}
            {...tip("re-read-rate")}
          />
          <MetricCard
            label="Avg Autonomy Score"
            value={fmt(m("autonomy-score"), 1)}
            delta={fmtDelta(m("autonomy-score"), prior("autonomy-score"), (n) => fmt(n, 1), range)}
            sparkline={spark("autonomy-score")}
            href={metricHref("autonomy-score")}
            {...tip("autonomy-score")}
          />
        </div>
      </div>
    </>
  );
}
