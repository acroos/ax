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
      <div className="flex items-center justify-center text-text-tertiary text-[12px] h-[160px]">
        No data available
      </div>
    );
  }

  const goodColor = "bg-green";
  const badColor = "bg-surface-3";
  const barFillClass = trueIsBetter ? goodColor : badColor;
  const barEmptyClass = trueIsBetter ? badColor : goodColor;

  return (
    <div>
      {/* Large stat */}
      <div className="flex items-baseline gap-3 mb-4">
        <span className="font-mono text-[36px] font-medium text-text-primary tracking-tight">
          {trueCount}
          <span className="text-text-tertiary text-[20px]"> / {total}</span>
        </span>
        <span className="text-[14px] text-text-secondary">
          PRs ({pct}%)
        </span>
      </div>

      {/* Proportion bar */}
      <div className="flex rounded-full overflow-hidden h-3 mb-6">
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
          <h4 className="text-[11px] font-medium text-text-tertiary uppercase tracking-wider mb-2">
            {trueLabel} ({trueCount})
          </h4>
          <div className="space-y-1">
            {trueEntries.map((e) => (
              <Link
                key={e.prId}
                href={`/prs/${e.prId}`}
                className="block text-[13px] text-text-secondary hover:text-text-primary transition-colors truncate"
              >
                <span className="font-mono text-accent">#{e.prNumber}</span>{" "}
                {e.title}
              </Link>
            ))}
            {trueEntries.length === 0 && (
              <span className="text-[12px] text-text-tertiary italic">None</span>
            )}
          </div>
        </div>
        <div>
          <h4 className="text-[11px] font-medium text-text-tertiary uppercase tracking-wider mb-2">
            {falseLabel} ({falseEntries.length})
          </h4>
          <div className="space-y-1">
            {falseEntries.map((e) => (
              <Link
                key={e.prId}
                href={`/prs/${e.prId}`}
                className="block text-[13px] text-text-secondary hover:text-text-primary transition-colors truncate"
              >
                <span className="font-mono text-accent">#{e.prNumber}</span>{" "}
                {e.title}
              </Link>
            ))}
            {falseEntries.length === 0 && (
              <span className="text-[12px] text-text-tertiary italic">None</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
