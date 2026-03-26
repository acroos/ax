import type { PRMetrics } from "./db";

export type MetricValueType = "int" | "float" | "ratio" | "boolean" | "currency";

export interface MetricDefEntry {
  slug: string;
  docSlug: string;
  field: keyof PRMetrics;
  label: string;
  category: "Output Quality" | "Prompt Efficiency" | "Agent Behavior" | "Planning Effectiveness";
  valueType: MetricValueType;
  unit?: string;
  lowerIsBetter: boolean;
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
  },
  {
    slug: "first-pass-acceptance",
    docSlug: "first-pass-acceptance-rate",
    field: "first_pass_accepted",
    label: "First-Pass Acceptance",
    category: "Output Quality",
    valueType: "boolean",
    lowerIsBetter: false,
  },
  {
    slug: "ci-success-rate",
    docSlug: "ci-success-rate",
    field: "ci_success_rate",
    label: "CI Success Rate",
    category: "Output Quality",
    valueType: "ratio",
    lowerIsBetter: false,
  },
  {
    slug: "test-coverage",
    docSlug: "test-coverage-of-generated-code",
    field: "has_tests",
    label: "Test Coverage",
    category: "Output Quality",
    valueType: "boolean",
    lowerIsBetter: false,
  },
  {
    slug: "diff-churn",
    docSlug: "diff-churn",
    field: "diff_churn_lines",
    label: "Diff Churn",
    category: "Output Quality",
    valueType: "int",
    unit: "lines",
    lowerIsBetter: true,
  },
  {
    slug: "line-revisit-rate",
    docSlug: "line-revisit-rate",
    field: "line_revisit_rate",
    label: "Line Revisit Rate",
    category: "Output Quality",
    valueType: "float",
    lowerIsBetter: true,
  },

  // Prompt Efficiency
  {
    slug: "messages-per-pr",
    docSlug: "messages-per-pr",
    field: "messages_per_pr",
    label: "Messages / PR",
    category: "Prompt Efficiency",
    valueType: "int",
    lowerIsBetter: true,
  },
  {
    slug: "iteration-depth",
    docSlug: "iteration-depth",
    field: "iteration_depth",
    label: "Iteration Depth",
    category: "Prompt Efficiency",
    valueType: "int",
    lowerIsBetter: true,
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
  },

  // Agent Behavior
  {
    slug: "self-correction-rate",
    docSlug: "self-correction-rate",
    field: "self_correction_rate",
    label: "Self-Correction",
    category: "Agent Behavior",
    valueType: "ratio",
    lowerIsBetter: false,
  },
  {
    slug: "context-efficiency",
    docSlug: "context-efficiency",
    field: "context_efficiency",
    label: "Context Efficiency",
    category: "Agent Behavior",
    valueType: "float",
    lowerIsBetter: false,
  },
  {
    slug: "error-recovery",
    docSlug: "error-recovery-efficiency",
    field: "error_recovery_attempts",
    label: "Error Recovery",
    category: "Agent Behavior",
    valueType: "int",
    lowerIsBetter: true,
  },

  // Planning Effectiveness
  {
    slug: "plan-coverage",
    docSlug: "plan-to-implementation-coverage",
    field: "plan_coverage_score",
    label: "Plan Coverage",
    category: "Planning Effectiveness",
    valueType: "ratio",
    lowerIsBetter: false,
  },
  {
    slug: "plan-deviation",
    docSlug: "plan-deviation-score",
    field: "plan_deviation_score",
    label: "Plan Deviation",
    category: "Planning Effectiveness",
    valueType: "ratio",
    lowerIsBetter: true,
  },
  {
    slug: "scope-creep",
    docSlug: "scope-creep-detection",
    field: "scope_creep_detected",
    label: "Scope Creep",
    category: "Planning Effectiveness",
    valueType: "boolean",
    lowerIsBetter: true,
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
