import type { MetricAggregate } from "@/lib/db";
import {
  CATEGORIES,
  DISPLAYED_METRICS,
  formatMetricValue,
} from "@/lib/metric-defs";
import { SectionDivider } from "@/components/section-divider";
import { MetricCard, fmtDelta } from "@/components/metric-card";
import type { Range } from "@/components/range-toggle";

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

  return (
    <>
      {CATEGORIES.map((category) => {
        const categoryMetrics = DISPLAYED_METRICS.filter(
          (d) => d.category === category,
        );
        if (categoryMetrics.length === 0) return null;

        return (
          <div key={category} className="mb-8">
            <SectionDivider label={category} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {categoryMetrics.map((def) => {
                const current = m(def.slug);
                const priorVal = prior(def.slug);
                const formatter = (n: number | null) =>
                  n === null ? "\u2014" : formatMetricValue(n, def);

                return (
                  <MetricCard
                    key={def.slug}
                    label={def.label}
                    value={formatter(current)}
                    delta={fmtDelta(current, priorVal, formatter, range)}
                    sparkline={spark(def.slug)}
                    href={metricHref(def.slug)}
                    tooltip={def.tooltip}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}
