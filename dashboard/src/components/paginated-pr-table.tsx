"use client";

import { useState, useCallback } from "react";
import Link from "next/link";

import type { PRWithMetrics, PaginatedPRs } from "@/lib/db";
import { getPRSize } from "@/lib/pr-utils";
import { StateBadge } from "@/components/state-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";

function fmtTokens(n: number): string {
  return Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

function PRRow({ pr }: { pr: PRWithMetrics }) {
  return (
    <TableRow>
      <TableCell>
        <Link
          href={`/prs/${pr.id}`}
          className="font-mono text-[13px] text-primary transition-colors hover:underline"
        >
          #{pr.number}
        </Link>
        {pr.github_owner && (
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {pr.github_owner}/{pr.github_repo}
          </div>
        )}
      </TableCell>
      <TableCell>
        <Link
          href={`/prs/${pr.id}`}
          className="line-clamp-1 text-[13px] text-foreground transition-colors hover:text-primary"
        >
          {pr.title ?? "Untitled"}
        </Link>
      </TableCell>
      <TableCell className="text-center">
        <Badge variant="outline" className="font-mono">
          {getPRSize(pr.additions, pr.deletions)}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-center gap-1.5">
          <StateBadge state={pr.state} />
          {pr.metrics && !pr.metrics.metrics_finalized && (
            <span
              className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-notice"
              title="Metrics pending"
            />
          )}
        </div>
      </TableCell>
      <TableCell className="text-center font-mono text-[13px] text-muted-foreground">
        {pr.metrics?.post_open_commits ?? "\u2014"}
      </TableCell>
      <TableCell className="text-center font-mono text-[13px] text-muted-foreground">
        {pr.metrics?.ci_success_rate !== null &&
        pr.metrics?.ci_success_rate !== undefined
          ? `${Math.round(pr.metrics.ci_success_rate * 100)}%`
          : "\u2014"}
      </TableCell>
      <TableCell className="text-center font-mono text-[13px] text-muted-foreground">
        {pr.metrics?.iteration_depth ?? "\u2014"}
      </TableCell>
      <TableCell className="text-right font-mono text-[13px] text-muted-foreground">
        {pr.metrics?.total_tokens !== null &&
        pr.metrics?.total_tokens !== undefined
          ? fmtTokens(pr.metrics.total_tokens)
          : "\u2014"}
      </TableCell>
      <TableCell className="text-center">
        {pr.session_count > 0 ? (
          <Badge variant="secondary" className="font-mono">
            {pr.session_count}
          </Badge>
        ) : (
          <span className="text-[13px] text-muted-foreground">&#8212;</span>
        )}
      </TableCell>
    </TableRow>
  );
}

export function PaginatedPRTableBody({
  initialData,
  fetchPath,
}: {
  initialData: PaginatedPRs;
  fetchPath: string;
}) {
  const [prs, setPrs] = useState<PRWithMetrics[]>(initialData.data);
  const [cursor, setCursor] = useState<string | null>(
    initialData.pagination.next_cursor,
  );
  const [hasMore, setHasMore] = useState(initialData.pagination.has_more);
  const [loading, setLoading] = useState(false);

  const loadMore = useCallback(async () => {
    if (!cursor || loading) return;
    setLoading(true);
    try {
      const separator = fetchPath.includes("?") ? "&" : "?";
      const res = await fetch(
        `/api/v1/${fetchPath}${separator}cursor=${encodeURIComponent(cursor)}`,
      );
      if (!res.ok) throw new Error("Failed to load");
      const page: PaginatedPRs = await res.json();
      setPrs((prev) => [...prev, ...page.data]);
      setCursor(page.pagination.next_cursor);
      setHasMore(page.pagination.has_more);
    } finally {
      setLoading(false);
    }
  }, [cursor, loading, fetchPath]);

  return (
    <>
      <TableBody>
        {prs.map((pr) => (
          <PRRow key={pr.id} pr={pr} />
        ))}
      </TableBody>
      {hasMore && (
        <tfoot>
          <tr>
            <td colSpan={9} className="p-4 text-center">
              <Button
                variant="outline"
                size="sm"
                onClick={loadMore}
                disabled={loading}
              >
                {loading ? "Loading..." : "Load more"}
              </Button>
            </td>
          </tr>
        </tfoot>
      )}
    </>
  );
}
