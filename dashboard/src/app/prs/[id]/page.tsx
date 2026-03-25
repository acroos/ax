import Link from "next/link";
import { listPRsWithMetrics } from "@/lib/db";
import type { PRWithMetrics } from "@/lib/db";

function StateBadge({ state }: { state: string | null }) {
  const s = state?.toLowerCase() ?? "unknown";
  const styles: Record<string, string> = {
    merged: "bg-purple-muted text-purple",
    open: "bg-green-muted text-green",
    closed: "bg-red-muted text-red",
  };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-[12px] font-medium ${styles[s] ?? "bg-surface-3 text-text-tertiary"}`}
    >
      {s}
    </span>
  );
}

interface MetricDisplay {
  label: string;
  value: string;
  description: string;
  category: string;
}

function getMetricDisplays(pr: PRWithMetrics): MetricDisplay[] {
  const m = pr.metrics;
  if (!m) return [];

  const metrics: MetricDisplay[] = [];

  if (m.post_open_commits !== null) {
    metrics.push({
      label: "Post-Open Commits",
      value: String(m.post_open_commits),
      description:
        "Commits pushed after the PR was opened. Lower means the initial output was closer to final.",
      category: "Output Quality",
    });
  }

  if (m.first_pass_accepted !== null) {
    metrics.push({
      label: "First-Pass Accepted",
      value: m.first_pass_accepted === 1 ? "Yes" : "No",
      description:
        "Whether the PR was merged without any reviewer requesting changes.",
      category: "Output Quality",
    });
  }

  if (m.ci_success_rate !== null) {
    metrics.push({
      label: "CI Success Rate",
      value: `${Math.round(m.ci_success_rate * 100)}%`,
      description:
        "Percentage of CI checks that passed. Low rates suggest checks weren't run locally before pushing.",
      category: "Output Quality",
    });
  }

  if (m.has_tests !== null) {
    metrics.push({
      label: "Includes Tests",
      value: m.has_tests === 1 ? "Yes" : "No",
      description:
        "Whether this PR includes changes to test files (*.test.*, *.spec.*, etc).",
      category: "Output Quality",
    });
  }

  if (m.diff_churn_lines !== null) {
    metrics.push({
      label: "Diff Churn",
      value: `${m.diff_churn_lines} lines`,
      description:
        "Lines written then rewritten before merge. Higher values mean more wasted effort.",
      category: "Output Quality",
    });
  }

  if (m.line_revisit_rate !== null) {
    metrics.push({
      label: "Line Revisit Rate",
      value: m.line_revisit_rate.toFixed(2),
      description:
        "How often files in this PR were also modified in other PRs. High values may indicate code instability or fast iteration.",
      category: "Output Quality",
    });
  }

  if (m.messages_per_pr !== null) {
    metrics.push({
      label: "Messages",
      value: String(m.messages_per_pr),
      description:
        "Human messages in Claude Code sessions that produced this PR. Fewer messages means clearer intent communication.",
      category: "Prompt Efficiency",
    });
  }

  if (m.iteration_depth !== null) {
    metrics.push({
      label: "Iteration Depth",
      value: String(m.iteration_depth),
      description:
        "Number of human→agent turn pairs. More turns mean more back-and-forth to reach the desired output.",
      category: "Prompt Efficiency",
    });
  }

  if (m.token_cost_usd !== null) {
    metrics.push({
      label: "Token Cost",
      value: `$${m.token_cost_usd.toFixed(2)}`,
      description:
        "Total dollar cost of tokens consumed across all sessions for this PR. Computed using model-specific pricing.",
      category: "Prompt Efficiency",
    });
  }

  if (m.self_correction_rate !== null) {
    metrics.push({
      label: "Self-Correction Rate",
      value: `${Math.round(m.self_correction_rate * 100)}%`,
      description:
        "How often the agent recovered from errors without human intervention. Higher is better.",
      category: "Agent Behavior",
    });
  }

  if (m.context_efficiency !== null) {
    metrics.push({
      label: "Context Efficiency",
      value: m.context_efficiency.toFixed(2),
      description:
        "Ratio of files modified to files read. Values around 0.3-0.5 are typical for thoughtful exploration.",
      category: "Agent Behavior",
    });
  }

  if (m.error_recovery_attempts !== null) {
    metrics.push({
      label: "Error Recovery Attempts",
      value: String(m.error_recovery_attempts),
      description:
        "Total Bash errors encountered. Fewer errors means the agent gets things right without trial-and-error.",
      category: "Agent Behavior",
    });
  }

  return metrics;
}

export default async function PRDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const prId = parseInt(id, 10);

  let pr: PRWithMetrics | undefined;
  try {
    const allPRs = listPRsWithMetrics();
    pr = allPRs.find((p) => p.id === prId);
  } catch {
    // DB error
  }

  if (!pr) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center space-y-3">
          <h2 className="text-text-primary text-lg font-medium">
            PR not found
          </h2>
          <Link href="/prs" className="text-accent text-sm hover:text-accent-hover">
            Back to Pull Requests
          </Link>
        </div>
      </div>
    );
  }

  const metricDisplays = getMetricDisplays(pr);

  // Group by category
  const categories = ["Output Quality", "Prompt Efficiency", "Agent Behavior"];
  const grouped = categories
    .map((cat) => ({
      name: cat,
      metrics: metricDisplays.filter((m) => m.category === cat),
    }))
    .filter((g) => g.metrics.length > 0);

  return (
    <div>
      <div className="mb-2 animate-in">
        <Link
          href="/prs"
          className="text-[12px] text-text-tertiary hover:text-text-secondary transition-colors"
        >
          ← Pull Requests
        </Link>
      </div>

      <div
        className="mb-8 animate-in"
        style={{ animationDelay: "50ms" }}
      >
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-[22px] font-semibold text-text-primary tracking-[-0.02em]">
            <span className="font-mono text-accent">#{pr.number}</span>{" "}
            {pr.title}
          </h1>
          <StateBadge state={pr.state} />
        </div>

        <div className="flex items-center gap-4 text-[13px] text-text-secondary">
          {pr.github_owner && (
            <span className="text-text-tertiary">
              {pr.github_owner}/{pr.github_repo}
            </span>
          )}
          {pr.branch && (
            <span className="font-mono text-[12px] bg-surface-2 px-2 py-0.5 rounded text-text-secondary">
              {pr.branch}
            </span>
          )}
          <span>
            <span className="text-green">+{pr.additions}</span>{" "}
            <span className="text-red">-{pr.deletions}</span>{" "}
            <span className="text-text-tertiary">
              across {pr.changed_files} file
              {pr.changed_files !== 1 && "s"}
            </span>
          </span>
        </div>
      </div>

      {grouped.length === 0 ? (
        <div className="text-center py-12 text-text-tertiary animate-in">
          No metrics computed yet. Run{" "}
          <code className="font-mono text-accent">ax sync</code>.
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map((group, gi) => (
            <div
              key={group.name}
              className="animate-in"
              style={{ animationDelay: `${100 + gi * 60}ms` }}
            >
              <h2 className="text-[11px] font-medium text-text-tertiary uppercase tracking-wider mb-3 px-1">
                {group.name}
              </h2>
              <div className="grid grid-cols-3 gap-3">
                {group.metrics.map((m) => (
                  <div
                    key={m.label}
                    className="metric-card rounded-xl border border-border-subtle bg-surface-1 p-5"
                  >
                    <div className="text-[12px] font-medium text-text-tertiary uppercase tracking-wider mb-3">
                      {m.label}
                    </div>
                    <div className="font-mono text-[28px] font-medium text-text-primary tracking-tight leading-none mb-2">
                      {m.value}
                    </div>
                    <div className="text-[12px] text-text-secondary leading-relaxed">
                      {m.description}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
