import Link from "next/link";

interface PREntry {
  prId: number;
  prNumber: number;
  title: string;
  value: boolean;
}

interface BooleanMetricSummaryProps {
  entries: PREntry[];
  trueLabel?: string;
  falseLabel?: string;
  trueIsBetter?: boolean;
}

export function BooleanMetricSummary({
  entries,
  trueLabel = "Yes",
  falseLabel = "No",
  trueIsBetter = true,
}: BooleanMetricSummaryProps) {
  const trueEntries = entries.filter((e) => e.value);
  const falseEntries = entries.filter((e) => !e.value);
  const total = entries.length;
  const trueCount = trueEntries.length;
  const pct = total > 0 ? Math.round((trueCount / total) * 100) : 0;

  if (total === 0) {
    return (
      <div className="flex h-[160px] items-center justify-center text-[12px] text-muted-foreground">
        No data available
      </div>
    );
  }

  // Non-judgmental palette (THEME.md §3): success (olive) marks the
  // "healthy" side, muted marks the other. "Better" doesn't mean "good."
  const goodColor = "bg-success";
  const badColor = "bg-muted";
  const barFillClass = trueIsBetter ? goodColor : badColor;
  const barEmptyClass = trueIsBetter ? badColor : goodColor;

  return (
    <div>
      {/* Large stat */}
      <div className="mb-4 flex items-baseline gap-3">
        <span className="font-mono text-[36px] font-medium tracking-tight text-foreground">
          {trueCount}
          <span className="text-[20px] text-muted-foreground"> / {total}</span>
        </span>
        <span className="text-[14px] text-muted-foreground">PRs ({pct}%)</span>
      </div>

      {/* Proportion bar */}
      <div className="mb-6 flex h-3 overflow-hidden rounded-full">
        {trueCount > 0 && (
          <div
            className={`${barFillClass} transition-all`}
            style={{ width: `${pct}%` }}
          />
        )}
        {falseEntries.length > 0 && (
          <div
            className={`${barEmptyClass} transition-all`}
            style={{ width: `${100 - pct}%` }}
          />
        )}
      </div>

      {/* Two-column PR list */}
      <div className="grid grid-cols-2 gap-6">
        <div>
          <h4 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {trueLabel} ({trueCount})
          </h4>
          <div className="space-y-1">
            {trueEntries.map((e) => (
              <Link
                key={e.prId}
                href={`/prs/${e.prId}`}
                className="block truncate text-[13px] text-muted-foreground transition-colors hover:text-foreground"
              >
                <span className="font-mono text-primary">#{e.prNumber}</span>{" "}
                {e.title}
              </Link>
            ))}
            {trueEntries.length === 0 && (
              <span className="text-[12px] italic text-muted-foreground">
                None
              </span>
            )}
          </div>
        </div>
        <div>
          <h4 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {falseLabel} ({falseEntries.length})
          </h4>
          <div className="space-y-1">
            {falseEntries.map((e) => (
              <Link
                key={e.prId}
                href={`/prs/${e.prId}`}
                className="block truncate text-[13px] text-muted-foreground transition-colors hover:text-foreground"
              >
                <span className="font-mono text-primary">#{e.prNumber}</span>{" "}
                {e.title}
              </Link>
            ))}
            {falseEntries.length === 0 && (
              <span className="text-[12px] italic text-muted-foreground">
                None
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
