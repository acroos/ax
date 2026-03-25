import { getAggregateMetrics, getTimeline, listRepos, getRepo } from "@/lib/db";
import { TrendChart, Sparkline } from "@/components/trend-chart";

interface MetricDef {
  label: string;
  value: string;
  description: string;
  tooltip: string;
  available: boolean;
  sparkData?: number[];
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

function buildMetrics(
  m: ReturnType<typeof getAggregateMetrics>,
  timeline: ReturnType<typeof getTimeline>
): MetricDef[] {
  const postOpenSpark = timeline.filter((t) => t.postOpenCommits !== null).map((t) => t.postOpenCommits!);
  const msgSpark = timeline.filter((t) => t.messagesPerPR !== null).map((t) => t.messagesPerPR!);
  const costSpark = timeline.filter((t) => t.tokenCostUSD !== null).map((t) => t.tokenCostUSD!);
  const ciSpark = timeline.filter((t) => t.ciSuccessRate !== null).map((t) => t.ciSuccessRate!);

  return [
    {
      label: "Total PRs",
      value: String(m.totalPRs),
      description: "Pull requests tracked",
      tooltip: "Total number of PRs ingested across synced repositories.",
      available: true,
    },
    {
      label: "Post-Open Commits",
      value: formatNum(m.avgPostOpenCommits),
      description: "Avg commits after PR opened",
      tooltip:
        "Average commits pushed after a PR is opened. Lower is better. Good: < 1.0. Concerning: > 3.0.",
      available: true,
      sparkData: postOpenSpark,
    },
    {
      label: "First-Pass Acceptance",
      value: formatPct(m.firstPassAcceptanceRate),
      description: "PRs merged without change requests",
      tooltip:
        "Percentage of PRs merged without reviewer requesting changes. Good: > 80%. Concerning: < 50%.",
      available: true,
    },
    {
      label: "CI Success Rate",
      value: m.ciSuccessRate !== null ? formatPct(m.ciSuccessRate) : "—",
      description: "Checks passing on first push",
      tooltip:
        "Percentage of CI checks passing on first push. Good: > 90%. Concerning: < 70%.",
      available: m.ciSuccessRate !== null,
      sparkData: ciSpark,
    },
    {
      label: "Test Coverage",
      value: formatPct(m.testCoverageRate),
      description: "PRs that include test files",
      tooltip:
        "Percentage of PRs that include test file changes. Good: > 70%. Concerning: < 40%.",
      available: true,
    },
    {
      label: "Messages / PR",
      value: m.avgMessagesPerPR !== null ? formatNum(m.avgMessagesPerPR) : "—",
      description: "Avg human messages per PR",
      tooltip:
        "Average human messages per PR. Good: < 10. Concerning: > 30. Requires session data.",
      available: m.avgMessagesPerPR !== null,
      sparkData: msgSpark,
    },
    {
      label: "Token Cost / PR",
      value: m.avgTokenCost !== null ? formatCost(m.avgTokenCost) : "—",
      description: "Avg dollar cost per PR",
      tooltip:
        "Average token cost per PR using model-specific pricing. Bug fixes ~$5, features ~$15-30.",
      available: m.avgTokenCost !== null,
      sparkData: costSpark,
    },
    {
      label: "Self-Correction",
      value:
        m.avgSelfCorrectionRate !== null
          ? formatPct(m.avgSelfCorrectionRate)
          : "—",
      description: "Agent error recovery rate",
      tooltip:
        "How often the agent recovers from errors without human help. Good: > 80%. Concerning: < 50%.",
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
        "Ratio of files modified to read. 0.3-0.5 is typical. Very high (> 2.0) may mean writing without reading enough.",
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
        <div className="flex items-center gap-2">
          {metric.sparkData && metric.sparkData.length >= 2 && (
            <Sparkline data={metric.sparkData} />
          )}
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

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ repo?: string }>;
}) {
  const params = await searchParams;
  const repoId = params.repo ? parseInt(params.repo, 10) : undefined;

  let metrics: ReturnType<typeof getAggregateMetrics>;
  let repos: ReturnType<typeof listRepos>;
  let timeline: ReturnType<typeof getTimeline>;
  let selectedRepo: ReturnType<typeof getRepo> | undefined;

  try {
    metrics = getAggregateMetrics(repoId);
    repos = listRepos();
    timeline = getTimeline(repoId);
    if (repoId) selectedRepo = getRepo(repoId);
  } catch {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center space-y-3">
          <div className="text-text-tertiary text-[40px]">&#x2B21;</div>
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

  const metricDefs = buildMetrics(metrics, timeline);
  const reposWithPRs = repos.filter((r) => r.github_owner && r.github_repo);
  const lastSync = reposWithPRs.map((r) => r.last_synced_at).filter(Boolean).sort().pop();

  const repoLabel = selectedRepo
    ? `${selectedRepo.github_owner}/${selectedRepo.github_repo}`
    : `${reposWithPRs.length} repositor${reposWithPRs.length === 1 ? "y" : "ies"}`;

  // Build chart data
  const costChartData = timeline
    .filter((t) => t.tokenCostUSD !== null)
    .map((t) => ({ label: `#${t.prNumber}`, value: t.tokenCostUSD! }));

  const messagesChartData = timeline
    .filter((t) => t.messagesPerPR !== null)
    .map((t) => ({ label: `#${t.prNumber}`, value: t.messagesPerPR! }));

  return (
    <div>
      <div className="mb-8 animate-in">
        <h1 className="text-[22px] font-semibold text-text-primary tracking-[-0.02em]">
          Overview
        </h1>
        <p className="text-[13px] text-text-secondary mt-1">
          {selectedRepo ? (
            <>
              Metrics for{" "}
              <span className="text-text-primary font-medium">{repoLabel}</span>
            </>
          ) : (
            <>Agentic coding metrics across {repoLabel}</>
          )}
          {lastSync && (
            <span className="text-text-tertiary"> · Last synced {lastSync}</span>
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
              total token spend across {metrics.totalPRs} PR{metrics.totalPRs !== 1 && "s"}
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 mb-8">
        {metricDefs.map((m, i) => (
          <MetricCard key={m.label} metric={m} index={i} />
        ))}
      </div>

      {(costChartData.length >= 2 || messagesChartData.length >= 2) && (
        <div className="grid grid-cols-2 gap-4 animate-in" style={{ animationDelay: "400ms" }}>
          {costChartData.length >= 2 && (
            <div className="rounded-xl border border-border-subtle bg-surface-1 p-5">
              <h3 className="text-[12px] font-medium text-text-tertiary uppercase tracking-wider mb-4">
                Token Cost per PR
              </h3>
              <TrendChart data={costChartData} color="#6366F1" unit="$" />
            </div>
          )}
          {messagesChartData.length >= 2 && (
            <div className="rounded-xl border border-border-subtle bg-surface-1 p-5">
              <h3 className="text-[12px] font-medium text-text-tertiary uppercase tracking-wider mb-4">
                Messages per PR
              </h3>
              <TrendChart data={messagesChartData} color="#34D399" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
