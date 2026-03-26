import { getAggregateMetricsAsync, getTimelineAsync, listReposAsync, getRepoAsync, listWatchStatusesAsync, getRepoLevelMetricsAsync, listPRsWithMetricsAsync, getPRSize, getPRSizeColor } from "@/lib/db";
import type { AggregateMetrics, TimelinePoint, Repo, WatchStatus, RepoLevelMetrics, PRWithMetrics } from "@/lib/db";
import { TrendChart, Sparkline } from "@/components/trend-chart";
import Link from "next/link";

interface MetricDef {
  label: string;
  value: string;
  description: string;
  tooltip: string;
  available: boolean;
  sparkData?: number[];
}

interface MetricCategory {
  name: string;
  subtitle?: string;
  metrics: MetricDef[];
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

function buildCategories(
  m: AggregateMetrics,
  timeline: TimelinePoint[]
): MetricCategory[] {
  const postOpenSpark = timeline.filter((t) => t.postOpenCommits !== null).map((t) => t.postOpenCommits!);
  const msgSpark = timeline.filter((t) => t.messagesPerPR !== null).map((t) => t.messagesPerPR!);
  const costSpark = timeline.filter((t) => t.tokenCostUSD !== null).map((t) => t.tokenCostUSD!);
  const ciSpark = timeline.filter((t) => t.ciSuccessRate !== null).map((t) => t.ciSuccessRate!);

  const categories: MetricCategory[] = [
    {
      name: "Output Quality",
      metrics: [
        {
          label: "Post-Open Commits",
          value: formatNum(m.avgPostOpenCommits),
          description: "Avg commits after PR opened",
          tooltip: "Average commits pushed after a PR is opened. Lower is better. Good: < 1.0. Concerning: > 3.0.",
          available: true,
          sparkData: postOpenSpark,
        },
        {
          label: "First-Pass Acceptance",
          value: formatPct(m.firstPassAcceptanceRate),
          description: "PRs merged without change requests",
          tooltip: "Percentage of PRs merged without reviewer requesting changes. Good: > 80%. Concerning: < 50%.",
          available: true,
        },
        {
          label: "CI Success Rate",
          value: m.ciSuccessRate !== null ? formatPct(m.ciSuccessRate) : "—",
          description: "Checks passing on first push",
          tooltip: "Percentage of CI checks passing on first push. Good: > 90%. Concerning: < 70%.",
          available: m.ciSuccessRate !== null,
          sparkData: ciSpark,
        },
        {
          label: "Test Coverage",
          value: formatPct(m.testCoverageRate),
          description: "PRs that include test files",
          tooltip: "Percentage of PRs that include test file changes. Good: > 70%. Concerning: < 40%.",
          available: true,
        },
        {
          label: "Diff Churn",
          value: m.avgDiffChurnLines !== null ? `${Math.round(m.avgDiffChurnLines)} lines` : "—",
          description: "Avg lines written then rewritten",
          tooltip: "Average lines written then rewritten before merge. Lower is better. Good: < 20. Concerning: > 100.",
          available: m.avgDiffChurnLines !== null,
        },
        {
          label: "Line Revisit Rate",
          value: m.avgLineRevisitRate !== null ? formatNum(m.avgLineRevisitRate, 2) : "—",
          description: "Cross-PR file re-modification",
          tooltip: "How often modified files get re-modified in later PRs. Lower suggests more stable code.",
          available: m.avgLineRevisitRate !== null,
        },
      ],
    },
    {
      name: "Prompt Efficiency",
      metrics: [
        {
          label: "Messages / PR",
          value: m.avgMessagesPerPR !== null ? formatNum(m.avgMessagesPerPR) : "—",
          description: "Avg human messages per PR",
          tooltip: "Average human messages per PR. Good: < 10. Concerning: > 30. Requires session data.",
          available: m.avgMessagesPerPR !== null,
          sparkData: msgSpark,
        },
        {
          label: "Iteration Depth",
          value: m.avgIterationDepth !== null ? formatNum(m.avgIterationDepth) : "—",
          description: "Avg human-agent turn pairs",
          tooltip: "Average human-agent turn pairs per PR. Good: < 5. Concerning: > 15.",
          available: m.avgIterationDepth !== null,
        },
        {
          label: "Token Cost / PR",
          value: m.avgTokenCost !== null ? formatCost(m.avgTokenCost) : "—",
          description: "Avg dollar cost per PR",
          tooltip: "Average token cost per PR using model-specific pricing. Bug fixes ~$5, features ~$15-30.",
          available: m.avgTokenCost !== null,
          sparkData: costSpark,
        },
      ],
    },
    {
      name: "Agent Behavior",
      metrics: [
        {
          label: "Self-Correction",
          value: m.avgSelfCorrectionRate !== null ? formatPct(m.avgSelfCorrectionRate) : "—",
          description: "Agent error recovery rate",
          tooltip: "How often the agent recovers from errors without human help. Good: > 80%. Concerning: < 50%.",
          available: m.avgSelfCorrectionRate !== null,
        },
        {
          label: "Context Efficiency",
          value: m.avgContextEfficiency !== null ? formatNum(m.avgContextEfficiency, 2) : "—",
          description: "Files modified / files read",
          tooltip: "Ratio of files modified to read. 0.3-0.5 is typical. Very high (> 2.0) may mean writing without reading enough.",
          available: m.avgContextEfficiency !== null,
        },
        {
          label: "Error Recovery",
          value: m.avgErrorRecoveryAttempts !== null ? formatNum(m.avgErrorRecoveryAttempts) : "—",
          description: "Avg bash errors per PR",
          tooltip: "Average bash errors per PR. Lower means the agent gets things right sooner.",
          available: m.avgErrorRecoveryAttempts !== null,
        },
      ],
    },
  ];

  // Only include Planning Effectiveness if there's plan data
  if (m.planDataCount > 0) {
    categories.push({
      name: "Planning Effectiveness",
      subtitle: m.planDataCount < m.totalPRs
        ? `Based on ${m.planDataCount} of ${m.totalPRs} PRs`
        : undefined,
      metrics: [
        {
          label: "Plan Coverage",
          value: m.avgPlanCoverage !== null ? formatPct(m.avgPlanCoverage) : "—",
          description: "Changes anticipated by plan",
          tooltip: "Fraction of actual changes that were anticipated by the plan. Good: > 70%.",
          available: m.avgPlanCoverage !== null,
        },
        {
          label: "Plan Deviation",
          value: m.avgPlanDeviation !== null ? formatPct(m.avgPlanDeviation) : "—",
          description: "Planned files actually changed",
          tooltip: "Fraction of planned files that were actually changed. Good: > 80%.",
          available: m.avgPlanDeviation !== null,
        },
        {
          label: "Scope Creep",
          value: m.scopeCreepRate !== null ? formatPct(m.scopeCreepRate) : "—",
          description: "PRs with unplanned changes",
          tooltip: "Fraction of PRs where most changes came from outside the plan. Lower is better.",
          available: m.scopeCreepRate !== null,
        },
      ],
    });
  }

  return categories;
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

function SummaryBanner({
  metrics,
  repoMetrics,
}: {
  metrics: AggregateMetrics;
  repoMetrics: RepoLevelMetrics;
}) {
  return (
    <div
      className="mb-6 rounded-xl border border-border-subtle bg-surface-1 p-5 animate-in"
      style={{ animationDelay: "0ms" }}
    >
      <div className="flex items-baseline gap-6 flex-wrap">
        <div>
          <span className="font-mono text-[32px] font-medium text-text-primary tracking-tight">
            {metrics.totalPRs}
          </span>
          <span className="text-[13px] text-text-secondary ml-2">
            PR{metrics.totalPRs !== 1 && "s"} tracked
          </span>
        </div>

        {metrics.totalTokenCost !== null && (
          <div className="border-l border-border-subtle pl-6">
            <span className="font-mono text-[32px] font-medium text-text-primary tracking-tight">
              {formatCost(metrics.totalTokenCost)}
            </span>
            <span className="text-[13px] text-text-secondary ml-2">
              total token spend
            </span>
          </div>
        )}

        {repoMetrics.unmergedCostUSD !== null && repoMetrics.unmergedCostUSD > 0 && (
          <div className="border-l border-border-subtle pl-6">
            <span className="font-mono text-[32px] font-medium text-amber tracking-tight">
              {formatCost(repoMetrics.unmergedCostUSD)}
            </span>
            <span className="text-[13px] text-text-secondary ml-2">
              unmerged
              {repoMetrics.unmergedRate !== null && (
                <span className="text-text-tertiary">
                  {" "}({Math.round(repoMetrics.unmergedRate * 100)}% waste)
                </span>
              )}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function PRTable({ prs }: { prs: PRWithMetrics[] }) {
  if (prs.length === 0) return null;

  return (
    <div className="animate-in" style={{ animationDelay: "600ms" }}>
      <h2 className="text-[14px] font-semibold text-text-primary tracking-[-0.01em] mb-3">
        Pull Requests
      </h2>
      <div className="rounded-xl border border-border-subtle bg-surface-1 overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border-subtle text-text-tertiary text-[11px] uppercase tracking-wider">
              <th className="text-left px-4 py-2.5 font-medium">PR</th>
              <th className="text-left px-4 py-2.5 font-medium">Title</th>
              <th className="text-center px-3 py-2.5 font-medium">Size</th>
              <th className="text-center px-3 py-2.5 font-medium">State</th>
              <th className="text-right px-3 py-2.5 font-medium">Post-Open</th>
              <th className="text-center px-3 py-2.5 font-medium">1st Pass</th>
              <th className="text-right px-3 py-2.5 font-medium">Messages</th>
              <th className="text-right px-4 py-2.5 font-medium">Cost</th>
            </tr>
          </thead>
          <tbody>
            {prs.map((pr) => {
              const size = getPRSize(pr.additions, pr.deletions);
              const sizeColor = getPRSizeColor(size);
              return (
                <tr
                  key={pr.id}
                  className="border-b border-border-subtle last:border-0 hover:bg-surface-2 transition-colors"
                >
                  <td className="px-4 py-2.5 font-mono text-text-secondary">
                    <Link
                      href={`/prs/${pr.id}`}
                      className="text-accent hover:text-text-primary transition-colors"
                    >
                      #{pr.number}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-text-primary truncate max-w-[300px]">
                    <Link
                      href={`/prs/${pr.id}`}
                      className="hover:text-accent transition-colors"
                    >
                      {pr.title || `PR #${pr.number}`}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-medium ${sizeColor}`}>
                      {size}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-medium ${
                      pr.state === "merged"
                        ? "text-purple bg-purple-muted"
                        : "text-text-tertiary bg-surface-2"
                    }`}>
                      {pr.state}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-text-secondary">
                    {pr.metrics?.post_open_commits ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {pr.metrics?.first_pass_accepted === 1 ? (
                      <span className="text-green">&#10003;</span>
                    ) : pr.metrics?.first_pass_accepted === 0 ? (
                      <span className="text-red">&#10007;</span>
                    ) : (
                      <span className="text-text-tertiary">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-text-secondary">
                    {pr.metrics?.messages_per_pr ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-text-secondary">
                    {pr.metrics?.token_cost_usd !== null && pr.metrics?.token_cost_usd !== undefined
                      ? formatCost(pr.metrics.token_cost_usd)
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
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

  let metrics: AggregateMetrics;
  let repos: Repo[];
  let timeline: TimelinePoint[];
  let selectedRepo: Repo | undefined;
  let watchStatuses: WatchStatus[];
  let repoMetrics: RepoLevelMetrics;
  let prs: PRWithMetrics[];

  try {
    [metrics, repos, timeline, watchStatuses, repoMetrics, prs] = await Promise.all([
      getAggregateMetricsAsync(repoId),
      listReposAsync(),
      getTimelineAsync(repoId),
      listWatchStatusesAsync(),
      getRepoLevelMetricsAsync(repoId),
      listPRsWithMetricsAsync(repoId),
    ]);
    if (repoId) selectedRepo = await getRepoAsync(repoId);
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

  const categories = buildCategories(metrics, timeline);
  const reposWithPRs = repos.filter((r) => r.github_owner && r.github_repo);
  const lastSync = reposWithPRs.map((r) => r.last_synced_at).filter(Boolean).sort().pop();
  const watchedCount = watchStatuses.length;
  const lastPolled = watchStatuses
    .map((w) => w.last_polled_at)
    .filter(Boolean)
    .sort()
    .pop();

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

  let cardIndex = 0;

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
            <>Finalized metrics across {repoLabel}</>
          )}
          {lastSync && (
            <span className="text-text-tertiary"> · Last synced {lastSync}</span>
          )}
          {watchedCount > 0 && (
            <span className="text-text-tertiary">
              {" "}· Watching {watchedCount} repo{watchedCount !== 1 && "s"}
              {lastPolled && <> · Last polled {lastPolled}</>}
            </span>
          )}
        </p>
      </div>

      <SummaryBanner metrics={metrics} repoMetrics={repoMetrics} />

      {categories.map((category) => (
        <div key={category.name} className="mb-6">
          <div className="flex items-baseline gap-2 mb-3">
            <h2 className="text-[14px] font-semibold text-text-primary tracking-[-0.01em]">
              {category.name}
            </h2>
            {category.subtitle && (
              <span className="text-[11px] text-text-tertiary">
                {category.subtitle}
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {category.metrics.map((m) => (
              <MetricCard key={m.label} metric={m} index={cardIndex++} />
            ))}
          </div>
        </div>
      ))}

      {(costChartData.length >= 2 || messagesChartData.length >= 2) && (
        <div className="grid grid-cols-2 gap-4 mb-8 animate-in" style={{ animationDelay: "400ms" }}>
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

      <PRTable prs={prs} />
    </div>
  );
}
