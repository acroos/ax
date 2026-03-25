import { Suspense } from "react";
import {
  listDevelopersAsync,
  getDeveloperComparisonAsync,
  getFilteredMetricsAsync,
} from "@/lib/db";
import type { DeveloperMetrics, AggregateMetrics } from "@/lib/db";
import { TimeWindowPicker } from "@/components/time-window-picker";
import { DeveloperSelector } from "@/components/developer-selector";

interface Props {
  searchParams: Promise<{ repo?: string; author?: string; since?: string; until?: string }>;
}

export default async function ComparePage({ searchParams }: Props) {
  const params = await searchParams;
  const repoId = params.repo ? parseInt(params.repo) : undefined;
  const author = params.author || undefined;
  const since = params.since || undefined;
  const until = params.until || undefined;

  let developers: string[] = [];
  let devComparison: DeveloperMetrics[] = [];
  let teamMetrics: AggregateMetrics | null = null;
  let individualMetrics: AggregateMetrics | null = null;

  try {
    developers = await listDevelopersAsync(repoId);
    devComparison = await getDeveloperComparisonAsync({ repoId, since, until });
    teamMetrics = await getFilteredMetricsAsync({ repoId, since, until });
    if (author) {
      individualMetrics = await getFilteredMetricsAsync({ repoId, author, since, until });
    }
  } catch {
    // DB not available
  }

  return (
    <div className="max-w-[1200px] mx-auto px-8 py-8">
      <div className="mb-8">
        <h1 className="text-[20px] font-semibold text-text-primary">Compare</h1>
        <p className="text-[13px] text-text-secondary mt-1">
          Developer and team metrics comparison
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-4 mb-8">
        <Suspense>
          <TimeWindowPicker />
        </Suspense>
        <Suspense>
          <DeveloperSelector developers={developers} />
        </Suspense>
      </div>

      {/* Individual vs Team comparison */}
      {author && individualMetrics && teamMetrics && (
        <div className="grid grid-cols-2 gap-6 mb-8">
          <MetricCard title={`${author}'s metrics`} metrics={individualMetrics} />
          <MetricCard title="Team average" metrics={teamMetrics} />
        </div>
      )}

      {/* Developer leaderboard */}
      {devComparison.length > 0 && (
        <div className="bg-surface-1 border border-border-subtle rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-border-subtle">
            <h2 className="text-[14px] font-medium text-text-primary">Developer Leaderboard</h2>
          </div>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-text-tertiary text-left border-b border-border-subtle">
                <th className="px-5 py-2 font-medium">Developer</th>
                <th className="px-5 py-2 font-medium text-right">PRs</th>
                <th className="px-5 py-2 font-medium text-right">Post-Open</th>
                <th className="px-5 py-2 font-medium text-right">1st Pass</th>
                <th className="px-5 py-2 font-medium text-right">CI Rate</th>
                <th className="px-5 py-2 font-medium text-right">Msgs/PR</th>
                <th className="px-5 py-2 font-medium text-right">Cost/PR</th>
              </tr>
            </thead>
            <tbody>
              {devComparison.map((dev) => (
                <tr
                  key={dev.author}
                  className="border-b border-border-subtle/50 hover:bg-surface-2/50 transition-colors"
                >
                  <td className="px-5 py-2.5 text-text-primary font-medium">{dev.author}</td>
                  <td className="px-5 py-2.5 text-right text-text-secondary">{dev.prCount}</td>
                  <td className="px-5 py-2.5 text-right text-text-secondary">
                    {dev.metrics.avgPostOpenCommits.toFixed(1)}
                  </td>
                  <td className="px-5 py-2.5 text-right text-text-secondary">
                    {(dev.metrics.firstPassAcceptanceRate * 100).toFixed(0)}%
                  </td>
                  <td className="px-5 py-2.5 text-right text-text-secondary">
                    {dev.metrics.ciSuccessRate !== null
                      ? `${(dev.metrics.ciSuccessRate * 100).toFixed(0)}%`
                      : "—"}
                  </td>
                  <td className="px-5 py-2.5 text-right text-text-secondary">
                    {dev.metrics.avgMessagesPerPR !== null
                      ? dev.metrics.avgMessagesPerPR.toFixed(0)
                      : "—"}
                  </td>
                  <td className="px-5 py-2.5 text-right text-text-secondary">
                    {dev.metrics.avgTokenCost !== null
                      ? `$${dev.metrics.avgTokenCost.toFixed(2)}`
                      : "—"}
                  </td>
                </tr>
              ))}
              {/* Team total row */}
              {teamMetrics && (
                <tr className="bg-surface-2/30 font-medium">
                  <td className="px-5 py-2.5 text-text-tertiary">Team</td>
                  <td className="px-5 py-2.5 text-right text-text-tertiary">{teamMetrics.totalPRs}</td>
                  <td className="px-5 py-2.5 text-right text-text-tertiary">
                    {teamMetrics.avgPostOpenCommits.toFixed(1)}
                  </td>
                  <td className="px-5 py-2.5 text-right text-text-tertiary">
                    {(teamMetrics.firstPassAcceptanceRate * 100).toFixed(0)}%
                  </td>
                  <td className="px-5 py-2.5 text-right text-text-tertiary">
                    {teamMetrics.ciSuccessRate !== null
                      ? `${(teamMetrics.ciSuccessRate * 100).toFixed(0)}%`
                      : "—"}
                  </td>
                  <td className="px-5 py-2.5 text-right text-text-tertiary">
                    {teamMetrics.avgMessagesPerPR !== null
                      ? teamMetrics.avgMessagesPerPR.toFixed(0)
                      : "—"}
                  </td>
                  <td className="px-5 py-2.5 text-right text-text-tertiary">
                    {teamMetrics.avgTokenCost !== null
                      ? `$${teamMetrics.avgTokenCost.toFixed(2)}`
                      : "—"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {devComparison.length === 0 && (
        <div className="text-center py-16 text-text-tertiary text-[13px]">
          No developer data available. Run <code className="bg-surface-2 px-1.5 py-0.5 rounded">ax sync --repo .</code> to populate.
        </div>
      )}
    </div>
  );
}

function MetricCard({ title, metrics }: { title: string; metrics: AggregateMetrics }) {
  const items = [
    { label: "PRs", value: metrics.totalPRs.toString() },
    { label: "Post-Open Commits", value: metrics.avgPostOpenCommits.toFixed(1) },
    { label: "1st Pass Acceptance", value: `${(metrics.firstPassAcceptanceRate * 100).toFixed(0)}%` },
    { label: "CI Success Rate", value: metrics.ciSuccessRate !== null ? `${(metrics.ciSuccessRate * 100).toFixed(0)}%` : "—" },
    { label: "Messages/PR", value: metrics.avgMessagesPerPR !== null ? metrics.avgMessagesPerPR.toFixed(0) : "—" },
    { label: "Token Cost/PR", value: metrics.avgTokenCost !== null ? `$${metrics.avgTokenCost.toFixed(2)}` : "—" },
    { label: "Self-Correction", value: metrics.avgSelfCorrectionRate !== null ? `${(metrics.avgSelfCorrectionRate * 100).toFixed(0)}%` : "—" },
    { label: "Context Efficiency", value: metrics.avgContextEfficiency !== null ? metrics.avgContextEfficiency.toFixed(2) : "—" },
  ];

  return (
    <div className="bg-surface-1 border border-border-subtle rounded-lg p-5">
      <h3 className="text-[13px] font-medium text-text-secondary mb-4">{title}</h3>
      <div className="space-y-2.5">
        {items.map((item) => (
          <div key={item.label} className="flex justify-between items-center">
            <span className="text-[12px] text-text-tertiary">{item.label}</span>
            <span className="text-[13px] text-text-primary font-medium">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
