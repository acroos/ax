import Link from "next/link";
import { getAggregateMetricsAsync, listPRsWithMetricsAsync } from "@/lib/db";
import type { AggregateMetrics } from "@/lib/db";

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="metric-card rounded-xl border border-border-subtle bg-surface-1 p-5">
      <div className="text-[12px] font-medium text-text-tertiary uppercase tracking-wider mb-3">
        {label}
      </div>
      <div className="font-mono text-[28px] font-medium text-text-primary tracking-tight leading-none mb-1">
        {value}
      </div>
      {detail && (
        <div className="text-[12px] text-text-secondary">{detail}</div>
      )}
    </div>
  );
}

function fmt(n: number | null, decimals = 1): string {
  if (n === null) return "\u2014";
  return n.toFixed(decimals);
}

function fmtPct(n: number | null): string {
  if (n === null) return "\u2014";
  return `${Math.round(n * 100)}%`;
}

function fmtCost(n: number | null): string {
  if (n === null) return "\u2014";
  return `$${n.toFixed(2)}`;
}

export default async function OrgOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ repo?: string }>;
}) {
  const { slug } = await params;
  const { repo } = await searchParams;
  const repoId = repo ? parseInt(repo, 10) : undefined;

  let metrics: AggregateMetrics;
  try {
    metrics = await getAggregateMetricsAsync(repoId, slug);
  } catch {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center space-y-3">
          <h2 className="text-text-primary text-lg font-medium">No data yet</h2>
          <p className="text-text-secondary text-sm">
            Connect a repository to start tracking metrics.
          </p>
        </div>
      </div>
    );
  }

  if (metrics.totalPRs === 0) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center space-y-3">
          <h2 className="text-text-primary text-lg font-medium">No finalized PRs yet</h2>
          <p className="text-text-secondary text-sm">
            Metrics appear once pull requests are merged or closed.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8 animate-in">
        <h1 className="text-[22px] font-semibold text-text-primary tracking-[-0.02em]">
          Overview
        </h1>
        <p className="text-[13px] text-text-secondary mt-1">
          Aggregate metrics across {metrics.totalPRs} finalized pull request{metrics.totalPRs !== 1 && "s"}
        </p>
      </div>

      {/* Output Quality */}
      <div className="mb-8 animate-in" style={{ animationDelay: "50ms" }}>
        <h2 className="text-[11px] font-medium text-text-tertiary uppercase tracking-wider mb-3 px-1">
          Output Quality
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <MetricCard
            label="Avg Post-Open Commits"
            value={fmt(metrics.avgPostOpenCommits)}
            detail="Lower is better"
          />
          <MetricCard
            label="First-Pass Acceptance"
            value={fmtPct(metrics.firstPassAcceptanceRate)}
            detail="PRs merged without changes requested"
          />
          <MetricCard
            label="CI Success Rate"
            value={fmtPct(metrics.ciSuccessRate)}
          />
          <MetricCard
            label="Test Coverage"
            value={fmtPct(metrics.testCoverageRate)}
            detail="PRs that include test changes"
          />
          <MetricCard
            label="Avg Diff Churn"
            value={metrics.avgDiffChurnLines !== null ? `${Math.round(metrics.avgDiffChurnLines)} lines` : "\u2014"}
            detail="Lines written then rewritten"
          />
          <MetricCard
            label="Avg Line Revisit Rate"
            value={fmt(metrics.avgLineRevisitRate, 2)}
            detail="Cross-PR file overlap"
          />
        </div>
      </div>

      {/* Prompt Efficiency */}
      <div className="mb-8 animate-in" style={{ animationDelay: "100ms" }}>
        <h2 className="text-[11px] font-medium text-text-tertiary uppercase tracking-wider mb-3 px-1">
          Prompt Efficiency
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <MetricCard
            label="Avg Messages / PR"
            value={fmt(metrics.avgMessagesPerPR, 0)}
          />
          <MetricCard
            label="Avg Iteration Depth"
            value={fmt(metrics.avgIterationDepth, 0)}
            detail="Human-agent turn pairs"
          />
          <MetricCard
            label="Avg Token Cost"
            value={fmtCost(metrics.avgTokenCost)}
          />
          {metrics.totalTokenCost !== null && (
            <MetricCard
              label="Total Token Cost"
              value={fmtCost(metrics.totalTokenCost)}
            />
          )}
        </div>
      </div>

      {/* Agent Behavior */}
      <div className="mb-8 animate-in" style={{ animationDelay: "150ms" }}>
        <h2 className="text-[11px] font-medium text-text-tertiary uppercase tracking-wider mb-3 px-1">
          Agent Behavior
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <MetricCard
            label="Avg Self-Correction Rate"
            value={fmtPct(metrics.avgSelfCorrectionRate)}
          />
          <MetricCard
            label="Avg Context Efficiency"
            value={fmt(metrics.avgContextEfficiency, 2)}
          />
          <MetricCard
            label="Avg Error Recovery"
            value={fmt(metrics.avgErrorRecoveryAttempts, 0)}
            detail="Bash errors per PR"
          />
        </div>
      </div>

      {/* Planning Effectiveness */}
      {metrics.planDataCount > 0 && (
        <div className="mb-8 animate-in" style={{ animationDelay: "200ms" }}>
          <h2 className="text-[11px] font-medium text-text-tertiary uppercase tracking-wider mb-3 px-1">
            Planning Effectiveness
          </h2>
          <div className="grid grid-cols-3 gap-3">
            <MetricCard
              label="Avg Plan Coverage"
              value={fmtPct(metrics.avgPlanCoverage)}
            />
            <MetricCard
              label="Avg Plan Deviation"
              value={fmtPct(metrics.avgPlanDeviation)}
            />
            <MetricCard
              label="Scope Creep Rate"
              value={fmtPct(metrics.scopeCreepRate)}
            />
          </div>
        </div>
      )}

      <div className="mt-6 animate-in" style={{ animationDelay: "250ms" }}>
        <Link
          href={`/${slug}/prs`}
          className="text-[13px] text-accent hover:text-accent-hover transition-colors"
        >
          View all pull requests →
        </Link>
      </div>
    </div>
  );
}
