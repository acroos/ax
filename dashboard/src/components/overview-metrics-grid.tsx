import type { MetricAggregate } from "@/lib/db";
import {
  CATEGORIES,
  DISPLAYED_METRICS,
  formatMetricValue,
} from "@/lib/metric-defs";
import { SectionDivider } from "@/components/section-divider";
import { MetricCard, fmtDelta } from "@/components/metric-card";
import type { Range } from "@/components/range-toggle";
import { agentSupportsMetric, AGENT_LABELS, type AgentType } from "@/lib/agents.gen";

export function OverviewMetricsGrid({
  metrics,
  range,
  metricHref,
  currentAgent,
}: {
  metrics: Record<string, MetricAggregate>;
  range: Range;
  metricHref: (slug: string) => string;
  /** When set, metrics unsupported by this agent render N/A instead of —. */
  currentAgent?: AgentType;
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
                // PR-derived metrics apply across all agents (no per-agent
                // capability), so they're never "unsupported" by an agent
                // filter. Only session-derived metrics depend on the agent
                // capability matrix.
                const isUnsupported =
                  currentAgent !== undefined &&
                  def.source === "session" &&
                  !agentSupportsMetric(currentAgent, def.slug);

                return (
                  <MetricCard
                    key={def.slug}
                    label={def.label}
                    value={formatter(current)}
                    delta={fmtDelta(current, priorVal, formatter, range)}
                    sparkline={spark(def.slug)}
                    href={metricHref(def.slug)}
                    tooltip={def.tooltip}
                    unsupported={isUnsupported}
                    unsupportedLabel={currentAgent ? AGENT_LABELS[currentAgent] : undefined}
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
