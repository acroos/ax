import type { PRMetrics, SessionMetrics } from "./db";

export type MetricValueType =
  | "int"
  | "float"
  | "ratio"
  | "boolean"
  | "currency";

export type MetricSource = "pr" | "session";

export interface MetricDefEntry {
  slug: string;
  docSlug: string;
  field: keyof PRMetrics | keyof SessionMetrics;
  label: string;
  category: "Output Quality" | "Prompt Efficiency" | "Agent Behavior";
  valueType: MetricValueType;
  unit?: string;
  lowerIsBetter: boolean;
  tooltip: string;
  source: MetricSource;
}

export const METRIC_DEFS: MetricDefEntry[] = [
  // Output Quality (PR-derived)
  {
    slug: "post-open-commits",
    docSlug: "post-open-commits",
    field: "post_open_commits",
    label: "Post-Open Commits",
    category: "Output Quality",
    valueType: "int",
    lowerIsBetter: true,
    source: "pr",
    tooltip:
      "How many commits were pushed after the PR was opened — fewer means the agent got it right the first time.",
  },
  {
    slug: "ci-success-rate",
    docSlug: "ci-success-rate",
    field: "ci_success_rate",
    label: "CI Success Rate",
    category: "Output Quality",
    valueType: "ratio",
    lowerIsBetter: false,
    source: "pr",
    tooltip:
      "How often agent-generated code passes CI on the first try — low rates mean the agent is producing code that doesn't build or pass tests.",
  },
  {
    slug: "line-revisit-rate",
    docSlug: "line-revisit-rate",
    field: "line_revisit_rate",
    label: "Line Revisit Rate",
    category: "Output Quality",
    valueType: "float",
    lowerIsBetter: true,
    source: "pr",
    tooltip:
      "How often the same files get changed across multiple recent PRs — high churn suggests the agent isn't making durable changes.",
  },

  // Prompt Efficiency (session-derived)
  {
    slug: "iteration-depth",
    docSlug: "iteration-depth",
    field: "iteration_depth",
    label: "Iteration Depth",
    category: "Prompt Efficiency",
    valueType: "int",
    lowerIsBetter: true,
    source: "session",
    tooltip:
      "How many back-and-forth turns it takes to finish a task — fewer means your prompts are clear and the agent stays on track.",
  },
  {
    slug: "token-cost-per-pr",
    docSlug: "token-cost-per-pr",
    field: "token_cost_usd",
    label: "Token Cost",
    category: "Prompt Efficiency",
    valueType: "currency",
    unit: "$",
    lowerIsBetter: true,
    source: "session",
    tooltip:
      "How much you spent on AI tokens to produce this PR — tracks whether the agent is cost-efficient or burning through tokens.",
  },
  {
    slug: "cache-hit-rate",
    docSlug: "cache-hit-rate",
    field: "cache_hit_rate",
    label: "Cache Hit Rate",
    category: "Prompt Efficiency",
    valueType: "ratio",
    lowerIsBetter: false,
    source: "session",
    tooltip:
      "How much of the agent's input was served from cache — higher means you're spending less on repeated context.",
  },

  // Agent Behavior (session-derived)
  {
    slug: "sidechain-rate",
    docSlug: "sidechain-rate",
    field: "sidechain_rate",
    label: "Sidechain Rate",
    category: "Agent Behavior",
    valueType: "ratio",
    lowerIsBetter: true,
    source: "session",
    tooltip:
      "How often the agent backtracks down dead-end reasoning paths — lower means less wasted work and faster completions.",
  },
  {
    slug: "re-read-rate",
    docSlug: "re-read-rate",
    field: "re_read_rate",
    label: "Re-Read Rate",
    category: "Agent Behavior",
    valueType: "float",
    lowerIsBetter: true,
    source: "session",
    tooltip:
      "How often the agent re-reads files it already opened — excessive re-reads waste tokens and slow things down.",
  },
  {
    slug: "autonomy-score",
    docSlug: "autonomy-score",
    field: "autonomy_score",
    label: "Autonomy Score",
    category: "Agent Behavior",
    valueType: "float",
    lowerIsBetter: false,
    source: "session",
    tooltip:
      "How much work the agent does between human interventions — higher means it operates independently with less hand-holding.",
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
