"use client";

import { useState, useCallback } from "react";

import type { PRWithMetrics } from "@/lib/db";
import { getPRSize } from "@/lib/pr-utils";
import { StateBadge } from "@/components/state-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";

const PAGE_SIZE = 25;

export function DemoPaginatedPRTableBody({
  allPrs,
}: {
  allPrs: PRWithMetrics[];
}) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const visible = allPrs.slice(0, visibleCount);
  const hasMore = visibleCount < allPrs.length;

  const loadMore = useCallback(() => {
    setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, allPrs.length));
  }, [allPrs.length]);

  return (
    <>
      <TableBody>
        {visible.map((pr) => (
          <TableRow key={pr.id}>
            <TableCell>
              <span className="font-mono text-[13px] text-primary">
                #{pr.number}
              </span>
              {pr.platform_owner && (
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {pr.platform_owner}/{pr.platform_repo}
                </div>
              )}
            </TableCell>
            <TableCell>
              <span className="line-clamp-1 text-[13px] text-foreground">
                {pr.title ?? "Untitled"}
              </span>
            </TableCell>
            <TableCell className="text-center">
              <Badge variant="outline" className="font-mono">
                {getPRSize(pr.additions, pr.deletions)}
              </Badge>
            </TableCell>
            <TableCell>
              <div className="flex items-center justify-center gap-1.5">
                <StateBadge state={pr.state} />
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
              {pr.metrics?.token_cost_usd !== null &&
              pr.metrics?.token_cost_usd !== undefined
                ? `$${pr.metrics.token_cost_usd.toFixed(2)}`
                : "\u2014"}
            </TableCell>
            <TableCell className="text-center">
              {pr.session_count > 0 ? (
                <Badge variant="secondary" className="font-mono">
                  {pr.session_count}
                </Badge>
              ) : (
                <span className="text-[13px] text-muted-foreground">
                  &#8212;
                </span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      {hasMore && (
        <tfoot>
          <tr>
            <td colSpan={9} className="p-4 text-center">
              <Button variant="outline" size="sm" onClick={loadMore}>
                Load more
              </Button>
            </td>
          </tr>
        </tfoot>
      )}
    </>
  );
}
