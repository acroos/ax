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
    tooltip: "Commits pushed after the PR was opened. Lower means the initial output was closer to final.",
    goodRange: "Good: < 2",
  },
  {
    slug: "first-pass-acceptance",
    docSlug: "first-pass-acceptance-rate",
    field: "first_pass_accepted",
    label: "First-Pass Acceptance",
    category: "Output Quality",
    valueType: "boolean",
    lowerIsBetter: false,
    tooltip: "PRs merged without any changes-requested reviews. Higher means reviewers approve on first look.",
    goodRange: "Good: > 80%",
  },
  {
    slug: "ci-success-rate",
    docSlug: "ci-success-rate",
    field: "ci_success_rate",
    label: "CI Success Rate",
    category: "Output Quality",
    valueType: "ratio",
    lowerIsBetter: false,
    tooltip: "Fraction of CI checks that pass. 1.0 means all green on every PR.",
    goodRange: "Good: > 90%",
  },
  {
    slug: "test-coverage",
    docSlug: "test-coverage-of-generated-code",
    field: "has_tests",
    label: "Test Coverage",
    category: "Output Quality",
    valueType: "boolean",
    lowerIsBetter: false,
    tooltip: "Whether the PR includes changes to test files. Detected by filename patterns.",
    goodRange: "Good: > 70%",
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
    tooltip: "Lines added across all commits minus lines in the final diff. Higher means more rework happened.",
    goodRange: "Good: < 50 lines",
  },
  {
    slug: "line-revisit-rate",
    docSlug: "line-revisit-rate",
    field: "line_revisit_rate",
    label: "Line Revisit Rate",
    category: "Output Quality",
    valueType: "float",
    lowerIsBetter: true,
    tooltip: "Files in this PR that were also changed in other recent PRs. Higher means unstable areas are being touched.",
    goodRange: "Good: < 0.2",
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
    tooltip: "Ratio of cache-read tokens to total input tokens. Higher means better prompt cache utilization and lower effective cost.",
    goodRange: "Good: > 70%",
  },
  {
    slug: "messages-per-pr",
    docSlug: "messages-per-pr",
    field: "messages_per_pr",
    label: "Messages / PR",
    category: "Prompt Efficiency",
    valueType: "int",
    lowerIsBetter: true,
    tooltip: "Total human + assistant messages across all sessions correlated with this PR.",
    goodRange: "Good: < 30",
  },
  {
    slug: "iteration-depth",
    docSlug: "iteration-depth",
    field: "iteration_depth",
    label: "Iteration Depth",
    category: "Prompt Efficiency",
    valueType: "int",
    lowerIsBetter: true,
    tooltip: "Number of human turns (back-and-forth cycles). Fewer turns means clearer prompting.",
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
    tooltip: "Dollar cost of all tokens used across correlated sessions, using model-specific pricing.",
    goodRange: "Good: < $5",
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
    tooltip: "Ratio of agent-initiated error recoveries to total errors. Higher means the agent fixes its own mistakes.",
    goodRange: "Good: > 60%",
  },
  {
    slug: "context-efficiency",
    docSlug: "context-efficiency",
    field: "context_efficiency",
    label: "Context Efficiency",
    category: "Agent Behavior",
    valueType: "float",
    lowerIsBetter: false,
    tooltip: "Ratio of files modified to files read. Higher means the agent stays focused on relevant files.",
    goodRange: "Good: > 0.3",
  },
  {
    slug: "error-recovery",
    docSlug: "error-recovery-efficiency",
    field: "error_recovery_attempts",
    label: "Error Recovery",
    category: "Agent Behavior",
    valueType: "int",
    lowerIsBetter: true,
    tooltip: "Number of times the agent encountered errors during tool execution. Fewer errors means smoother execution.",
    goodRange: "Good: < 5",
  },

  {
    slug: "sidechain-rate",
    docSlug: "sidechain-rate",
    field: "sidechain_rate",
    label: "Sidechain Rate",
    category: "Agent Behavior",
    valueType: "ratio",
    lowerIsBetter: true,
    tooltip: "Fraction of messages on sidechain branches (backtracking). Lower means fewer dead-end reasoning paths.",
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
    tooltip: "Total file reads divided by unique files read. 1.0 means no re-reads; higher means files are being read redundantly.",
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
    tooltip: "Ratio of assistant messages to human messages. Higher means the agent works more independently with fewer interventions.",
    goodRange: "Good: > 3.0",
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
    tooltip: "Fraction of planned files that were actually changed. Higher means the plan was followed through.",
    goodRange: "Good: > 80%",
  },
  {
    slug: "plan-deviation",
    docSlug: "plan-deviation-score",
    field: "plan_deviation_score",
    label: "Plan Deviation",
    category: "Planning Effectiveness",
    valueType: "ratio",
    lowerIsBetter: true,
    tooltip: "Fraction of changed files that were not in the plan. Lower means work stayed on track.",
    goodRange: "Good: < 20%",
  },
  {
    slug: "scope-creep",
    docSlug: "scope-creep-detection",
    field: "scope_creep_detected",
    label: "Scope Creep",
    category: "Planning Effectiveness",
    valueType: "boolean",
    lowerIsBetter: true,
    tooltip: "Whether significant unplanned work was detected. Less scope creep means better planning.",
    goodRange: "Good: < 20%",
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
