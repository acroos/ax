import Link from "next/link";
import { listPRsWithMetrics, getPRSize, getPRSizeColor } from "@/lib/db";

function StateBadge({ state }: { state: string | null }) {
  const s = state?.toLowerCase() ?? "unknown";
  const styles: Record<string, string> = {
    merged: "bg-purple-muted text-purple",
    open: "bg-green-muted text-green",
    closed: "bg-red-muted text-red",
  };
  const style = styles[s] ?? "bg-surface-3 text-text-tertiary";

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${style}`}
    >
      {s}
    </span>
  );
}

function CheckMark({ value }: { value: boolean }) {
  return value ? (
    <span className="text-green text-[13px]">✓</span>
  ) : (
    <span className="text-text-tertiary text-[13px]">✗</span>
  );
}

export default async function PRsPage({
  searchParams,
}: {
  searchParams: Promise<{ repo?: string }>;
}) {
  const params = await searchParams;
  const repoId = params.repo ? parseInt(params.repo, 10) : undefined;
  let prs: ReturnType<typeof listPRsWithMetrics>;

  try {
    prs = listPRsWithMetrics(repoId);
  } catch {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center space-y-3">
          <h2 className="text-text-primary text-lg font-medium">No data yet</h2>
          <p className="text-text-secondary text-sm">
            Run <code className="font-mono text-accent">ax sync</code> first.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 animate-in">
        <h1 className="text-[22px] font-semibold text-text-primary tracking-[-0.02em]">
          Pull Requests
        </h1>
        <p className="text-[13px] text-text-secondary mt-1">
          {prs.length} pull request{prs.length !== 1 && "s"} tracked
        </p>
      </div>

      <div className="rounded-xl border border-border-subtle overflow-hidden animate-in" style={{ animationDelay: "50ms" }}>
        <table className="w-full">
          <thead>
            <tr className="bg-surface-1">
              <th className="text-left px-4 py-2.5 text-[11px] font-medium text-text-tertiary uppercase tracking-wider">
                PR
              </th>
              <th className="text-left px-4 py-2.5 text-[11px] font-medium text-text-tertiary uppercase tracking-wider">
                Title
              </th>
              <th className="text-center px-3 py-2.5 text-[11px] font-medium text-text-tertiary uppercase tracking-wider">
                Size
              </th>
              <th className="text-center px-3 py-2.5 text-[11px] font-medium text-text-tertiary uppercase tracking-wider">
                State
              </th>
              <th className="text-center px-3 py-2.5 text-[11px] font-medium text-text-tertiary uppercase tracking-wider tooltip-trigger">
                Post-Open
                <span className="tooltip-content">Commits after PR opened</span>
              </th>
              <th className="text-center px-3 py-2.5 text-[11px] font-medium text-text-tertiary uppercase tracking-wider tooltip-trigger">
                1st Pass
                <span className="tooltip-content">Merged without change requests</span>
              </th>
              <th className="text-center px-3 py-2.5 text-[11px] font-medium text-text-tertiary uppercase tracking-wider tooltip-trigger">
                CI
                <span className="tooltip-content">CI checks passing rate</span>
              </th>
              <th className="text-center px-3 py-2.5 text-[11px] font-medium text-text-tertiary uppercase tracking-wider tooltip-trigger">
                Tests
                <span className="tooltip-content">PR includes test file changes</span>
              </th>
              <th className="text-center px-3 py-2.5 text-[11px] font-medium text-text-tertiary uppercase tracking-wider tooltip-trigger">
                Msgs
                <span className="tooltip-content">Human messages in session</span>
              </th>
              <th className="text-right px-4 py-2.5 text-[11px] font-medium text-text-tertiary uppercase tracking-wider tooltip-trigger">
                Cost
                <span className="tooltip-content">Token cost in dollars</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {prs.map((pr, i) => (
              <tr
                key={pr.id}
                className="border-t border-border-subtle hover:bg-surface-1/50 transition-colors animate-in"
                style={{ animationDelay: `${80 + i * 20}ms` }}
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/prs/${pr.id}`}
                    className="font-mono text-[13px] text-accent hover:text-accent-hover transition-colors"
                  >
                    #{pr.number}
                  </Link>
                  {pr.github_owner && (
                    <div className="text-[11px] text-text-tertiary mt-0.5">
                      {pr.github_owner}/{pr.github_repo}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/prs/${pr.id}`}
                    className="text-[13px] text-text-primary hover:text-accent-hover transition-colors line-clamp-1"
                  >
                    {pr.title ?? "Untitled"}
                  </Link>
                </td>
                <td className="px-3 py-3 text-center">
                  {(() => {
                    const size = getPRSize(pr.additions, pr.deletions);
                    const color = getPRSizeColor(size);
                    return (
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-mono font-medium ${color}`}>
                        {size}
                      </span>
                    );
                  })()}
                </td>
                <td className="px-3 py-3 text-center">
                  <StateBadge state={pr.state} />
                </td>
                <td className="px-3 py-3 text-center font-mono text-[13px] text-text-secondary">
                  {pr.metrics?.post_open_commits ?? "—"}
                </td>
                <td className="px-3 py-3 text-center">
                  {pr.metrics?.first_pass_accepted !== null ? (
                    <CheckMark value={pr.metrics!.first_pass_accepted === 1} />
                  ) : (
                    <span className="text-text-tertiary text-[13px]">—</span>
                  )}
                </td>
                <td className="px-3 py-3 text-center font-mono text-[13px] text-text-secondary">
                  {pr.metrics?.ci_success_rate !== null
                    ? `${Math.round(pr.metrics!.ci_success_rate * 100)}%`
                    : "—"}
                </td>
                <td className="px-3 py-3 text-center">
                  {pr.metrics?.has_tests !== null ? (
                    <CheckMark value={pr.metrics!.has_tests === 1} />
                  ) : (
                    <span className="text-text-tertiary text-[13px]">—</span>
                  )}
                </td>
                <td className="px-3 py-3 text-center font-mono text-[13px] text-text-secondary">
                  {pr.metrics?.messages_per_pr ?? "—"}
                </td>
                <td className="px-4 py-3 text-right font-mono text-[13px] text-text-secondary">
                  {pr.metrics?.token_cost_usd !== null
                    ? `$${pr.metrics!.token_cost_usd.toFixed(2)}`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
