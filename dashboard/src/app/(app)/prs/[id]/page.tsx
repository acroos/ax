import Link from "next/link";
import { Suspense } from "react";

import { getPRWithMetricsAsync, getPRSize } from "@/lib/db";
import type { PRWithMetrics } from "@/lib/db";
import { Skeleton } from "@/components/skeleton";
import { SectionErrorBoundary } from "@/components/section-error-boundary";
import { StateBadge } from "@/components/state-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

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

  if (m.ci_success_rate !== null) {
    metrics.push({
      label: "CI Success Rate",
      value: `${Math.round(m.ci_success_rate * 100)}%`,
      description:
        "Percentage of CI checks that passed. Low rates suggest checks weren't run locally before pushing.",
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

  if (m.review_cycle_time_minutes !== null) {
    metrics.push({
      label: "Review Cycle Time",
      value: `${m.review_cycle_time_minutes} min`,
      description:
        "Minutes from PR open to first human review. Lower is a faster feedback loop.",
      category: "Output Quality",
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

  if (m.cache_hit_rate !== null) {
    metrics.push({
      label: "Cache Hit Rate",
      value: `${Math.round(m.cache_hit_rate * 100)}%`,
      description:
        "Ratio of cache-read tokens to total input tokens. Higher means better prompt cache utilization.",
      category: "Prompt Efficiency",
    });
  }

  if (m.sidechain_rate !== null) {
    metrics.push({
      label: "Sidechain Rate",
      value: `${Math.round(m.sidechain_rate * 100)}%`,
      description:
        "Fraction of messages on sidechain branches. Lower means fewer dead-end reasoning paths.",
      category: "Agent Behavior",
    });
  }

  if (m.re_read_rate !== null) {
    metrics.push({
      label: "Re-Read Rate",
      value: m.re_read_rate.toFixed(2),
      description:
        "Total file reads divided by unique files read. 1.0 means no re-reads; higher is redundant.",
      category: "Agent Behavior",
    });
  }

  if (m.autonomy_score !== null) {
    metrics.push({
      label: "Autonomy Score",
      value: m.autonomy_score.toFixed(1),
      description:
        "Ratio of assistant to human messages. Higher means the agent worked more independently.",
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

  // Kick off the fetch without awaiting; header and body will each consume
  // the same promise so React dedupes into one request.
  const prPromise = getPRWithMetricsAsync(prId);

  return (
    <div>
      {/* Back link renders synchronously — doesn't depend on PR data. */}
      <div className="mb-2">
        <Link
          href="/prs"
          className="text-[12px] text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Pull Requests
        </Link>
      </div>

      <SectionErrorBoundary fallback={<PRNotFound />}>
        <Suspense fallback={<HeaderSkeleton />}>
          <PRHeader promise={prPromise} />
        </Suspense>

        <Suspense fallback={<MetricGroupsSkeleton />}>
          <MetricGroups promise={prPromise} />
        </Suspense>
      </SectionErrorBoundary>
    </div>
  );
}

function PRNotFound() {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <div className="space-y-3 text-center">
        <h2 className="text-lg font-medium text-foreground">PR not found</h2>
        <Link
          href="/prs"
          className="text-sm text-primary transition-colors hover:underline"
        >
          Back to Pull Requests
        </Link>
      </div>
    </div>
  );
}

function HeaderSkeleton() {
  return (
    <div className="mb-8">
      <div className="mb-2 flex items-center gap-3">
        <Skeleton className="h-7 w-96" />
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-14 rounded" />
      </div>
      <div className="flex items-center gap-4">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-5 w-40 rounded" />
        <Skeleton className="h-3 w-56" />
      </div>
    </div>
  );
}

async function PRHeader({ promise }: { promise: Promise<PRWithMetrics | undefined> }) {
  const pr = await promise;
  if (!pr) throw new Error("PR not found");

  return (
    <div className="mb-8">
      <div className="mb-2 flex items-center gap-3">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">
          <span className="font-mono text-primary">#{pr.number}</span>{" "}
          {pr.title}
        </h1>
        <StateBadge state={pr.state} />
        <Badge variant="outline" className="font-mono">
          {getPRSize(pr.additions, pr.deletions)}
        </Badge>
      </div>

      <div className="flex items-center gap-4 text-[13px] text-muted-foreground">
        {pr.github_owner && (
          <span>
            {pr.github_owner}/{pr.github_repo}
          </span>
        )}
        {pr.branch && (
          <span className="rounded bg-muted px-2 py-0.5 font-mono text-[12px]">
            {pr.branch}
          </span>
        )}
        <span>
          <span className="text-success">+{pr.additions}</span>{" "}
          <span className="text-attention">-{pr.deletions}</span>{" "}
          <span>
            across {pr.changed_files} file
            {pr.changed_files !== 1 && "s"}
          </span>
        </span>
        {pr.metrics?.finalized_at && (
          <span>
            Finalized {new Date(pr.metrics.finalized_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </span>
        )}
      </div>
    </div>
  );
}

function MetricGroupsSkeleton() {
  return (
    <div className="space-y-6">
      {[4, 3, 3].map((count, gi) => (
        <div key={gi}>
          <Skeleton className="mb-3 ml-1 h-3 w-32" />
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: count }).map((_, i) => (
              <Card key={i} className="p-5">
                <CardContent className="p-0">
                  <Skeleton className="mb-3 h-3 w-28" />
                  <Skeleton className="mb-3 h-7 w-20" />
                  <Skeleton className="mb-1.5 h-3 w-full" />
                  <Skeleton className="h-3 w-4/5" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

async function MetricGroups({ promise }: { promise: Promise<PRWithMetrics | undefined> }) {
  const pr = await promise;
  if (!pr) throw new Error("PR not found");

  const metricDisplays = getMetricDisplays(pr);
  const categories = ["Output Quality", "Prompt Efficiency", "Agent Behavior"];
  const grouped = categories
    .map((cat) => ({
      name: cat,
      metrics: metricDisplays.filter((m) => m.category === cat),
    }))
    .filter((g) => g.metrics.length > 0);

  if (grouped.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        No metrics computed yet.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {grouped.map((group) => (
        <div key={group.name}>
          <h2 className="mb-3 px-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {group.name}
          </h2>
          <div className="grid grid-cols-3 gap-3">
            {group.metrics.map((m) => (
              <Card key={m.label} className="p-5">
                <CardContent className="p-0">
                  <div className="mb-3 text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
                    {m.label}
                  </div>
                  <div className="mb-2 font-mono text-[28px] font-medium leading-none tracking-tight text-foreground">
                    {m.value}
                  </div>
                  <div className="text-[12px] leading-relaxed text-muted-foreground">
                    {m.description}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
