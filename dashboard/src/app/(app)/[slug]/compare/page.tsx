import { Suspense } from "react";
import {
  listPRsWithMetricsAsync,
  computeAggregatesFromPRs,
} from "@/lib/db";
import type { DeveloperMetrics, AggregateMetrics, PRWithMetrics } from "@/lib/db";
import { TimeWindowPicker } from "@/components/time-window-picker";
import { DeveloperSelector } from "@/components/developer-selector";
import { Skeleton } from "@/components/skeleton";
import { SectionErrorBoundary } from "@/components/section-error-boundary";

function filterPRsLocal(prs: PRWithMetrics[], opts: { author?: string; since?: string; until?: string }): PRWithMetrics[] {
  return prs.filter((p) => {
    if (opts.author && p.author !== opts.author) return false;
    if (opts.since && p.created_at && p.created_at < opts.since) return false;
    if (opts.until && p.created_at && p.created_at > opts.until) return false;
    return true;
  });
}

function buildDeveloperComparison(prs: PRWithMetrics[]): DeveloperMetrics[] {
  const byAuthor = new Map<string, PRWithMetrics[]>();
  for (const pr of prs) {
    const author = pr.author || "unknown";
    if (!byAuthor.has(author)) byAuthor.set(author, []);
    byAuthor.get(author)!.push(pr);
  }
  const result: DeveloperMetrics[] = [];
  for (const [author, authorPRs] of byAuthor) {
    result.push({ author, prCount: authorPRs.length, metrics: computeAggregatesFromPRs(authorPRs) });
  }
  return result.sort((a, b) => b.prCount - a.prCount);
}

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ repo?: string; author?: string; since?: string; until?: string }>;
}

export default async function OrgComparePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const p = await searchParams;
  const repoId = p.repo ? parseInt(p.repo) : undefined;
  const author = p.author || undefined;
  const since = p.since || undefined;
  const until = p.until || undefined;

  // Fetch once; swallow errors so downstream sections render an empty state
  // rather than a full-page error.
  const prsPromise = listPRsWithMetricsAsync(repoId, slug).catch(() => [] as PRWithMetrics[]);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-[20px] font-semibold text-text-primary">Compare</h1>
        <p className="text-[13px] text-text-secondary mt-1">
          Developer and team metrics comparison
        </p>
      </div>

      {/* Filter bar — TimeWindowPicker is author-agnostic and renders
          instantly; DeveloperSelector needs the author list from PRs. */}
      <div className="flex items-center gap-4 mb-8">
        <TimeWindowPicker />
        <Suspense fallback={<Skeleton className="h-7 w-56" />}>
          <AsyncDeveloperSelector promise={prsPromise} />
        </Suspense>
      </div>

      {/* Individual vs team cards are only shown when an author is selected.
          Gate the whole section behind Suspense so the cards stream in. */}
      {author && (
        <SectionErrorBoundary fallback={null}>
          <Suspense fallback={<IndividualVsTeamSkeleton />}>
            <IndividualVsTeam
              promise={prsPromise}
              author={author}
              since={since}
              until={until}
            />
          </Suspense>
        </SectionErrorBoundary>
      )}

      {/* Leaderboard */}
      <SectionErrorBoundary fallback={<NoDevData />}>
        <Suspense fallback={<LeaderboardSkeleton />}>
          <Leaderboard
            promise={prsPromise}
            since={since}
            until={until}
          />
        </Suspense>
      </SectionErrorBoundary>
    </div>
  );
}

async function AsyncDeveloperSelector({
  promise,
}: {
  promise: Promise<PRWithMetrics[]>;
}) {
  const prs = await promise;
  const authorSet = new Set<string>();
  for (const pr of prs) if (pr.author) authorSet.add(pr.author);
  const developers = Array.from(authorSet).sort();
  return <DeveloperSelector developers={developers} />;
}

function IndividualVsTeamSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-6 mb-8">
      {[0, 1].map((i) => (
        <div
          key={i}
          className="bg-surface-1 border border-border-subtle rounded-lg p-5"
        >
          <Skeleton className="h-4 w-32 mb-4" />
          {Array.from({ length: 12 }).map((_, j) => (
            <div key={j} className="flex justify-between items-center py-1">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

async function IndividualVsTeam({
  promise,
  author,
  since,
  until,
}: {
  promise: Promise<PRWithMetrics[]>;
  author: string;
  since: string | undefined;
  until: string | undefined;
}) {
  const allPRs = await promise;
  const timeFiltered = filterPRsLocal(allPRs, { since, until });
  const teamMetrics = computeAggregatesFromPRs(timeFiltered);
  const authorFiltered = filterPRsLocal(allPRs, { author, since, until });
  const individualMetrics = computeAggregatesFromPRs(authorFiltered);

  return (
    <div className="grid grid-cols-2 gap-6 mb-8">
      <MetricCard title={`${author}'s metrics`} metrics={individualMetrics} />
      <MetricCard title="Team average" metrics={teamMetrics} />
    </div>
  );
}

function LeaderboardSkeleton() {
  return (
    <div className="bg-surface-1 border border-border-subtle rounded-lg overflow-hidden">
      <div className="px-5 py-3 border-b border-border-subtle">
        <Skeleton className="h-4 w-48" />
      </div>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-text-tertiary text-left border-b border-border-subtle">
            {Array.from({ length: 9 }).map((_, i) => (
              <th key={i} className="px-5 py-2">
                <Skeleton className="h-3 w-16" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 6 }).map((_, i) => (
            <tr key={i} className="border-b border-border-subtle/50">
              {Array.from({ length: 9 }).map((_, j) => (
                <td key={j} className="px-5 py-2.5">
                  <Skeleton className="h-4 w-full max-w-[80px]" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NoDevData() {
  return (
    <div className="text-center py-16 text-text-tertiary text-[13px]">
      No developer data available. Connect a repository to start tracking metrics.
    </div>
  );
}

async function Leaderboard({
  promise,
  since,
  until,
}: {
  promise: Promise<PRWithMetrics[]>;
  since: string | undefined;
  until: string | undefined;
}) {
  const allPRs = await promise;
  const timeFiltered = filterPRsLocal(allPRs, { since, until });
  const devComparison = buildDeveloperComparison(timeFiltered);
  const teamMetrics = computeAggregatesFromPRs(timeFiltered);

  if (devComparison.length === 0) return <NoDevData />;

  return (
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
            <th className="px-5 py-2 font-medium text-right">Depth</th>
            <th className="px-5 py-2 font-medium text-right">Cost/PR</th>
            <th className="px-5 py-2 font-medium text-right">Errors</th>
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
                  : "\u2014"}
              </td>
              <td className="px-5 py-2.5 text-right text-text-secondary">
                {dev.metrics.avgMessagesPerPR !== null
                  ? dev.metrics.avgMessagesPerPR.toFixed(0)
                  : "\u2014"}
              </td>
              <td className="px-5 py-2.5 text-right text-text-secondary">
                {dev.metrics.avgIterationDepth !== null
                  ? dev.metrics.avgIterationDepth.toFixed(0)
                  : "\u2014"}
              </td>
              <td className="px-5 py-2.5 text-right text-text-secondary">
                {dev.metrics.avgTokenCost !== null
                  ? `$${dev.metrics.avgTokenCost.toFixed(2)}`
                  : "\u2014"}
              </td>
              <td className="px-5 py-2.5 text-right text-text-secondary">
                {dev.metrics.avgErrorRecoveryAttempts !== null
                  ? dev.metrics.avgErrorRecoveryAttempts.toFixed(0)
                  : "\u2014"}
              </td>
            </tr>
          ))}
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
                : "\u2014"}
            </td>
            <td className="px-5 py-2.5 text-right text-text-tertiary">
              {teamMetrics.avgMessagesPerPR !== null
                ? teamMetrics.avgMessagesPerPR.toFixed(0)
                : "\u2014"}
            </td>
            <td className="px-5 py-2.5 text-right text-text-tertiary">
              {teamMetrics.avgIterationDepth !== null
                ? teamMetrics.avgIterationDepth.toFixed(0)
                : "\u2014"}
            </td>
            <td className="px-5 py-2.5 text-right text-text-tertiary">
              {teamMetrics.avgTokenCost !== null
                ? `$${teamMetrics.avgTokenCost.toFixed(2)}`
                : "\u2014"}
            </td>
            <td className="px-5 py-2.5 text-right text-text-tertiary">
              {teamMetrics.avgErrorRecoveryAttempts !== null
                ? teamMetrics.avgErrorRecoveryAttempts.toFixed(0)
                : "\u2014"}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function MetricCard({ title, metrics }: { title: string; metrics: AggregateMetrics }) {
  const items = [
    { label: "PRs", value: metrics.totalPRs.toString() },
    { label: "Post-Open Commits", value: metrics.avgPostOpenCommits.toFixed(1) },
    { label: "1st Pass Acceptance", value: `${(metrics.firstPassAcceptanceRate * 100).toFixed(0)}%` },
    { label: "CI Success Rate", value: metrics.ciSuccessRate !== null ? `${(metrics.ciSuccessRate * 100).toFixed(0)}%` : "\u2014" },
    { label: "Messages/PR", value: metrics.avgMessagesPerPR !== null ? metrics.avgMessagesPerPR.toFixed(0) : "\u2014" },
    { label: "Token Cost/PR", value: metrics.avgTokenCost !== null ? `$${metrics.avgTokenCost.toFixed(2)}` : "\u2014" },
    { label: "Iteration Depth", value: metrics.avgIterationDepth !== null ? metrics.avgIterationDepth.toFixed(0) : "\u2014" },
    { label: "Self-Correction", value: metrics.avgSelfCorrectionRate !== null ? `${(metrics.avgSelfCorrectionRate * 100).toFixed(0)}%` : "\u2014" },
    { label: "Context Efficiency", value: metrics.avgContextEfficiency !== null ? metrics.avgContextEfficiency.toFixed(2) : "\u2014" },
    { label: "Error Recovery", value: metrics.avgErrorRecoveryAttempts !== null ? metrics.avgErrorRecoveryAttempts.toFixed(0) : "\u2014" },
    { label: "Diff Churn", value: metrics.avgDiffChurnLines !== null ? `${Math.round(metrics.avgDiffChurnLines)} lines` : "\u2014" },
    { label: "Line Revisit Rate", value: metrics.avgLineRevisitRate !== null ? metrics.avgLineRevisitRate.toFixed(2) : "\u2014" },
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
