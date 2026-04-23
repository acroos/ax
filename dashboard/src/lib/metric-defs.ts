import type { PRMetrics, SessionMetrics } from "./db";

export type MetricValueType =
  | "int"
  | "float"
  | "ratio"
  | "boolean"
  | "currency";

export type MetricSource = "pr" | "session";

export type MetricCategory =
  | "Delivery"
  | "Session Effectiveness"
  | "Adoption Maturity";

export const CATEGORIES: MetricCategory[] = [
  "Delivery",
  "Session Effectiveness",
  "Adoption Maturity",
];

export interface MetricDefEntry {
  slug: string;
  docSlug: string;
  field: keyof PRMetrics | keyof SessionMetrics;
  label: string;
  category: MetricCategory;
  valueType: MetricValueType;
  unit?: string;
  lowerIsBetter: boolean;
  tooltip: string;
  source: MetricSource;
  displayed: boolean;
}

export const METRIC_DEFS: MetricDefEntry[] = [
  // ── Delivery (PR-derived) ──────────────────────────────────────────────
  {
    slug: "post-open-commits",
    docSlug: "post-open-commits",
    field: "post_open_commits",
    label: "Post-Open Commits",
    category: "Delivery",
    valueType: "int",
    lowerIsBetter: true,
    source: "pr",
    displayed: true,
    tooltip:
      "How many commits were pushed after the PR was opened — fewer means the agent got it right the first time.",
  },

  // ── Session Effectiveness (session-derived) ────────────────────────────
  {
    slug: "iteration-depth",
    docSlug: "iteration-depth",
    field: "iteration_depth",
    label: "Iteration Depth",
    category: "Session Effectiveness",
    valueType: "int",
    lowerIsBetter: true,
    source: "session",
    displayed: true,
    tooltip:
      "How many back-and-forth turns it takes to finish a task — fewer means your prompts are clear and the agent stays on track.",
  },
  {
    slug: "autonomy-score",
    docSlug: "autonomy-score",
    field: "autonomy_score",
    label: "Autonomy Score",
    category: "Session Effectiveness",
    valueType: "float",
    lowerIsBetter: false,
    source: "session",
    displayed: true,
    tooltip:
      "How much work the agent does between human interventions — higher means it operates independently with less hand-holding.",
  },

  // ── Hidden metrics (still computed, not shown on overview) ─────────────
  {
    slug: "ci-success-rate",
    docSlug: "ci-success-rate",
    field: "ci_success_rate",
    label: "CI Success Rate",
    category: "Delivery",
    valueType: "ratio",
    lowerIsBetter: false,
    source: "pr",
    displayed: false,
    tooltip:
      "How often agent-generated code passes CI on the first try — low rates mean the agent is producing code that doesn't build or pass tests.",
  },
  {
    slug: "line-revisit-rate",
    docSlug: "line-revisit-rate",
    field: "line_revisit_rate",
    label: "Line Revisit Rate",
    category: "Delivery",
    valueType: "float",
    lowerIsBetter: true,
    source: "pr",
    displayed: false,
    tooltip:
      "How often the same files get changed across multiple recent PRs — high churn suggests the agent isn't making durable changes.",
  },
  {
    slug: "token-cost-per-pr",
    docSlug: "token-cost-per-pr",
    field: "token_cost_usd",
    label: "Token Cost",
    category: "Session Effectiveness",
    valueType: "currency",
    unit: "$",
    lowerIsBetter: true,
    source: "session",
    displayed: false,
    tooltip:
      "How much you spent on AI tokens to produce this PR — tracks whether the agent is cost-efficient or burning through tokens.",
  },
  {
    slug: "cache-hit-rate",
    docSlug: "cache-hit-rate",
    field: "cache_hit_rate",
    label: "Cache Hit Rate",
    category: "Session Effectiveness",
    valueType: "ratio",
    lowerIsBetter: false,
    source: "session",
    displayed: false,
    tooltip:
      "How much of the agent's input was served from cache — higher means you're spending less on repeated context.",
  },
  {
    slug: "sidechain-rate",
    docSlug: "sidechain-rate",
    field: "sidechain_rate",
    label: "Sidechain Rate",
    category: "Session Effectiveness",
    valueType: "ratio",
    lowerIsBetter: true,
    source: "session",
    displayed: false,
    tooltip:
      "How often the agent backtracks down dead-end reasoning paths — lower means less wasted work and faster completions.",
  },
  {
    slug: "re-read-rate",
    docSlug: "re-read-rate",
    field: "re_read_rate",
    label: "Re-Read Rate",
    category: "Session Effectiveness",
    valueType: "float",
    lowerIsBetter: true,
    source: "session",
    displayed: false,
    tooltip:
      "How often the agent re-reads files it already opened — excessive re-reads waste tokens and slow things down.",
  },
];

export const DISPLAYED_METRICS = METRIC_DEFS.filter((d) => d.displayed);

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
