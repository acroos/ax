import { getAggregateMetrics, listRepos } from "@/lib/db";

interface MetricDef {
  label: string;
  value: string;
  description: string;
  tooltip: string;
  available: boolean;
}

function formatPct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function formatNum(n: number, decimals = 1): string {
  return n.toFixed(decimals);
}

function formatCost(n: number): string {
  if (n < 0.01) return "<$0.01";
  return `$${n.toFixed(2)}`;
}

function buildMetrics(m: ReturnType<typeof getAggregateMetrics>): MetricDef[] {
  return [
    {
      label: "Total PRs",
      value: String(m.totalPRs),
      description: "Pull requests tracked",
      tooltip: "Total number of PRs ingested across all synced repositories.",
      available: true,
    },
    {
      label: "Post-Open Commits",
      value: formatNum(m.avgPostOpenCommits),
      description: "Avg commits after PR opened",
      tooltip:
        "Average number of commits pushed after a PR is opened. Lower is better — it means the initial output was close to final. Good: < 1.0. Concerning: > 3.0.",
      available: true,
    },
    {
      label: "First-Pass Acceptance",
      value: formatPct(m.firstPassAcceptanceRate),
      description: "PRs merged without change requests",
      tooltip:
        "Percentage of PRs merged without any reviewer requesting changes. Measures initial output quality. Good: > 80%. Concerning: < 50%.",
      available: true,
    },
    {
      label: "CI Success Rate",
      value: m.ciSuccessRate !== null ? formatPct(m.ciSuccessRate) : "—",
      description: "Checks passing on first push",
      tooltip:
        "Percentage of CI checks that pass on the first push. Low rates suggest the agent isn't running checks locally. Good: > 90%. Concerning: < 70%.",
      available: m.ciSuccessRate !== null,
    },
    {
      label: "Test Coverage",
      value: formatPct(m.testCoverageRate),
      description: "PRs that include test files",
      tooltip:
        "Percentage of PRs that include changes to test files (*.test.*, *.spec.*, __tests__/). Measures whether the agent writes tests alongside code. Good: > 70%. Concerning: < 40%.",
      available: true,
    },
    {
      label: "Messages / PR",
      value: m.avgMessagesPerPR !== null ? formatNum(m.avgMessagesPerPR) : "—",
      description: "Avg human messages per PR",
      tooltip:
        "Average number of human messages in Claude Code sessions that produced a PR. Fewer messages means you communicated intent efficiently. Good: < 10. Concerning: > 30. Requires session data.",
      available: m.avgMessagesPerPR !== null,
    },
    {
      label: "Token Cost / PR",
      value: m.avgTokenCost !== null ? formatCost(m.avgTokenCost) : "—",
      description: "Avg dollar cost per PR",
      tooltip:
        "Average token cost across all sessions correlated to a PR. Computed using model-specific pricing. Context: simple bug fixes ~$5, medium features ~$15-30. Requires session data.",
      available: m.avgTokenCost !== null,
    },
    {
      label: "Self-Correction",
      value:
        m.avgSelfCorrectionRate !== null
          ? formatPct(m.avgSelfCorrectionRate)
          : "—",
      description: "Agent error recovery rate",
      tooltip:
        "How often the agent recovers from errors without human intervention. Higher is better — the agent fixes its own mistakes. Good: > 80%. Concerning: < 50%. Requires session data.",
      available: m.avgSelfCorrectionRate !== null,
    },
    {
      label: "Context Efficiency",
      value:
        m.avgContextEfficiency !== null
          ? formatNum(m.avgContextEfficiency, 2)
          : "—",
      description: "Files modified / files read",
      tooltip:
        "Ratio of files the agent modified to files it read. Values around 0.3-0.5 are typical — reading more than you change means thoughtful exploration. Very high (> 2.0) may mean writing without reading enough. Requires session data.",
      available: m.avgContextEfficiency !== null,
    },
  ];
}

function MetricCard({ metric, index }: { metric: MetricDef; index: number }) {
  return (
    <div
      className="metric-card rounded-xl border border-border-subtle bg-surface-1 p-5 animate-in"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-[12px] font-medium text-text-tertiary uppercase tracking-wider">
          {metric.label}
        </span>
        <div className="tooltip-trigger">
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            className="text-text-tertiary hover:text-text-secondary transition-colors cursor-help"
          >
            <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1" />
            <path
              d="M5.5 5.5C5.5 4.67 6.17 4 7 4C7.83 4 8.5 4.67 8.5 5.5C8.5 6.17 8 6.5 7.5 6.75C7.28 6.86 7 7.06 7 7.5"
              stroke="currentColor"
              strokeWidth="1"
              strokeLinecap="round"
            />
            <circle cx="7" cy="9.5" r="0.5" fill="currentColor" />
          </svg>
          <div className="tooltip-content">{metric.tooltip}</div>
        </div>
      </div>

      <div className="font-mono text-[28px] font-medium text-text-primary tracking-tight leading-none mb-1.5">
        {metric.available ? (
          metric.value
        ) : (
          <span className="text-text-tertiary">—</span>
        )}
      </div>

      <div className="text-[12px] text-text-secondary leading-snug">
        {metric.available ? (
          metric.description
        ) : (
          <span className="text-text-tertiary italic">
            Run ax sync to populate
          </span>
        )}
      </div>
    </div>
  );
}

export default function OverviewPage() {
  let metrics: ReturnType<typeof getAggregateMetrics>;
  let repos: ReturnType<typeof listRepos>;

  try {
    metrics = getAggregateMetrics();
    repos = listRepos();
  } catch {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center space-y-3">
          <div className="text-text-tertiary text-[40px]">⬡</div>
          <h2 className="text-text-primary text-lg font-medium">No data yet</h2>
          <p className="text-text-secondary text-sm max-w-[320px]">
            Run{" "}
            <code className="font-mono text-accent bg-accent-muted px-1.5 py-0.5 rounded text-[13px]">
              ax sync --repo .
            </code>{" "}
            in a git repository to start tracking metrics.
          </p>
        </div>
      </div>
    );
  }

  const metricDefs = buildMetrics(metrics);

  const reposWithPRs = repos.filter((r) => r.github_owner && r.github_repo);
  const lastSync = reposWithPRs
    .map((r) => r.last_synced_at)
    .filter(Boolean)
    .sort()
    .pop();

  return (
    <div>
      <div className="mb-8 animate-in">
        <h1 className="text-[22px] font-semibold text-text-primary tracking-[-0.02em]">
          Overview
        </h1>
        <p className="text-[13px] text-text-secondary mt-1">
          Agentic coding metrics across {reposWithPRs.length} repositor
          {reposWithPRs.length === 1 ? "y" : "ies"}
          {lastSync && (
            <span className="text-text-tertiary">
              {" "}
              · Last synced {lastSync}
            </span>
          )}
        </p>
      </div>

      {metrics.totalTokenCost !== null && (
        <div
          className="mb-6 rounded-xl border border-border-subtle bg-surface-1 p-5 animate-in"
          style={{ animationDelay: "0ms" }}
        >
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-[32px] font-medium text-text-primary tracking-tight">
              {formatCost(metrics.totalTokenCost)}
            </span>
            <span className="text-[13px] text-text-secondary">
              total token spend across all tracked PRs
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        {metricDefs.map((m, i) => (
          <MetricCard key={m.label} metric={m} index={i} />
        ))}
      </div>
    </div>
  );
}
