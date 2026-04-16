import type { PRMetrics } from "./db";

export type MetricValueType =
  | "int"
  | "float"
  | "ratio"
  | "boolean"
  | "currency";

export interface MetricDefEntry {
  slug: string;
  docSlug: string;
  field: keyof PRMetrics;
  label: string;
  category: "Output Quality" | "Prompt Efficiency" | "Agent Behavior";
  valueType: MetricValueType;
  unit?: string;
  lowerIsBetter: boolean;
  tooltip: string;
  goodRange: string;
}

export const METRIC_DEFS: MetricDefEntry[] = [
  // Output Quality
  {
    slug: "post-open-commits",
    docSlug: "post-open-commits",
    field: "post_open_commits",
    label: "Post-Open Commits",
    category: "Output Quality",
    valueType: "int",
    lowerIsBetter: true,
    tooltip:
      "Commits pushed after the PR was opened. Lower means the initial output was closer to final.",
    goodRange: "Good: < 2",
  },
  {
    slug: "ci-success-rate",
    docSlug: "ci-success-rate",
    field: "ci_success_rate",
    label: "CI Success Rate",
    category: "Output Quality",
    valueType: "ratio",
    lowerIsBetter: false,
    tooltip:
      "Fraction of CI checks that pass. 1.0 means all green on every PR.",
    goodRange: "Good: > 90%",
  },
  {
    slug: "line-revisit-rate",
    docSlug: "line-revisit-rate",
    field: "line_revisit_rate",
    label: "Line Revisit Rate",
    category: "Output Quality",
    valueType: "float",
    lowerIsBetter: true,
    tooltip:
      "Files in this PR that were also changed in other recent PRs. Higher means unstable areas are being touched.",
    goodRange: "Good: < 0.2",
  },
  {
    slug: "review-cycle-time",
    docSlug: "review-cycle-time",
    field: "review_cycle_time_minutes",
    label: "Review Cycle Time",
    category: "Output Quality",
    valueType: "int",
    unit: "min",
    lowerIsBetter: true,
    tooltip:
      "Minutes from PR open to first human review. Lower means a faster feedback loop.",
    goodRange: "Good: < 120 min",
  },

  // Prompt Efficiency
  {
    slug: "cache-hit-rate",
    docSlug: "cache-hit-rate",
    field: "cache_hit_rate",
    label: "Cache Hit Rate",
    category: "Prompt Efficiency",
    valueType: "ratio",
    lowerIsBetter: false,
    tooltip:
      "Ratio of cache-read tokens to total input tokens. Higher means better prompt cache utilization and lower effective cost.",
    goodRange: "Good: > 70%",
  },
  {
    slug: "iteration-depth",
    docSlug: "iteration-depth",
    field: "iteration_depth",
    label: "Iteration Depth",
    category: "Prompt Efficiency",
    valueType: "int",
    lowerIsBetter: true,
    tooltip:
      "Number of human turns (back-and-forth cycles). Fewer turns means clearer prompting.",
    goodRange: "Good: < 15",
  },
  {
    slug: "token-cost-per-pr",
    docSlug: "token-cost-per-pr",
    field: "token_cost_usd",
    label: "Token Cost / PR",
    category: "Prompt Efficiency",
    valueType: "currency",
    unit: "$",
    lowerIsBetter: true,
    tooltip:
      "Dollar cost of all tokens used across correlated sessions, using model-specific pricing.",
    goodRange: "Good: < $5",
  },

  // Agent Behavior
  {
    slug: "sidechain-rate",
    docSlug: "sidechain-rate",
    field: "sidechain_rate",
    label: "Sidechain Rate",
    category: "Agent Behavior",
    valueType: "ratio",
    lowerIsBetter: true,
    tooltip:
      "Fraction of messages on sidechain branches (backtracking). Lower means fewer dead-end reasoning paths.",
    goodRange: "Good: < 10%",
  },
  {
    slug: "re-read-rate",
    docSlug: "re-read-rate",
    field: "re_read_rate",
    label: "Re-Read Rate",
    category: "Agent Behavior",
    valueType: "float",
    lowerIsBetter: true,
    tooltip:
      "Total file reads divided by unique files read. 1.0 means no re-reads; higher means files are being read redundantly.",
    goodRange: "Good: < 1.5",
  },
  {
    slug: "autonomy-score",
    docSlug: "autonomy-score",
    field: "autonomy_score",
    label: "Autonomy Score",
    category: "Agent Behavior",
    valueType: "float",
    lowerIsBetter: false,
    tooltip:
      "Ratio of assistant messages to human messages. Higher means the agent works more independently with fewer interventions.",
    goodRange: "Good: > 3.0",
  },
];

export function getMetricDef(slug: string): MetricDefEntry | undefined {
  return METRIC_DEFS.find((d) => d.slug === slug);
}

export function formatMetricValue(value: number, def: MetricDefEntry): string {
  switch (def.valueType) {
    case "ratio":
      return `${Math.round(value * 100)}%`;
    case "boolean":
      return value === 1 ? "Yes" : "No";
    case "currency":
      return value < 0.01 ? "<$0.01" : `$${value.toFixed(2)}`;
    case "float":
      return value.toFixed(2);
    case "int":
    default:
      return String(Math.round(value));
  }
}
