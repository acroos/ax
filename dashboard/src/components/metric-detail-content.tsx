import Link from "next/link";

import { BooleanMetricSummary } from "@/components/boolean-metric-summary";
import { MetricTrendChart } from "@/components/metric-trend-chart";
import { Card, CardContent } from "@/components/ui/card";
import {
  formatMetricValue,
  type MetricDefEntry,
} from "@/lib/metric-defs";
import {
  RANGE_DAYS,
  percentile,
  aggregateByDay,
  computeDistribution,
  isPRValue,
  type MetricValue,
  type PRValue,
  type SessionValue,
  type DistBucket,
} from "@/lib/metric-utils";
import type { Range } from "@/components/range-toggle";

// ---------------------------------------------------------------------------
// MetricDetailBody — stats, trend chart, distribution, notable items
// ---------------------------------------------------------------------------

export function MetricDetailBody({
  values,
  allValues,
  def,
  range,
  prHref,
}: {
  values: MetricValue[];
  allValues: MetricValue[];
  def: MetricDefEntry;
  range: Range;
  prHref?: (prId: number) => string;
}) {
  const numericValues = values.map((v) => v.value);
  const sorted = [...numericValues].sort((a, b) => a - b);
  const avg = numericValues.reduce((s, v) => s + v, 0) / numericValues.length;
  const p10 = percentile(sorted, 10);
  const p50 = percentile(sorted, 50);
  const p90 = percentile(sorted, 90);

  const days = RANGE_DAYS[range];
  const rangeStart = Date.now() - days * 24 * 60 * 60 * 1000;
  const priorStart = rangeStart - days * 24 * 60 * 60 * 1000;
  const priorValues = allValues.filter(
    (v) => v.timestamp >= priorStart && v.timestamp < rangeStart,
  );
  const priorNums = priorValues.map((v) => v.value);
  const priorSorted = [...priorNums].sort((a, b) => a - b);

  function makeDelta(
    current: number,
    prior: number | null,
  ): string | undefined {
    if (prior === null) return undefined;
    const diff = current - prior;
    if (Math.abs(diff) < 0.005)
      return `\u2014 no change vs prior ${range}`;
    const arrow = diff > 0 ? "\u2191" : "\u2193";
    return `${arrow} ${formatMetricValue(Math.abs(diff), def)} vs prior ${range}`;
  }

  const priorAvg =
    priorNums.length > 0
      ? priorNums.reduce((s, v) => s + v, 0) / priorNums.length
      : null;
  const priorP10 =
    priorSorted.length > 0 ? percentile(priorSorted, 10) : null;
  const priorP50 =
    priorSorted.length > 0 ? percentile(priorSorted, 50) : null;
  const priorP90 =
    priorSorted.length > 0 ? percentile(priorSorted, 90) : null;

  const dailyData = aggregateByDay(values);
  const distribution = computeDistribution(numericValues, def);

  const byValue = [...values].sort((a, b) => b.value - a.value);
  const highest = byValue.slice(0, 3);
  const isSessionMetric = def.source === "session";
  const notableLabel = isSessionMetric ? "Notable Sessions" : "Notable PRs";

  // For notable lowest, exclude items already in highest
  const highestIds = new Set(
    highest.map((v) => isPRValue(v) ? v.prId : (v as SessionValue).sessionId),
  );
  const lowest = byValue
    .slice(-3)
    .reverse()
    .filter((v) => {
      const id = isPRValue(v) ? v.prId : (v as SessionValue).sessionId;
      return !highestIds.has(id);
    });

  const stats: { label: string; value: string; delta?: string }[] = [
    { label: "Count", value: String(values.length) },
    {
      label: "Average",
      value: formatMetricValue(avg, def),
      delta: makeDelta(avg, priorAvg),
    },
    {
      label: "P10",
      value: formatMetricValue(p10, def),
      delta: makeDelta(p10, priorP10),
    },
    {
      label: "P50",
      value: formatMetricValue(p50, def),
      delta: makeDelta(p50, priorP50),
    },
    {
      label: "P90",
      value: formatMetricValue(p90, def),
      delta: makeDelta(p90, priorP90),
    },
  ];

  return (
    <>
      {/* Summary stats */}
      <div className="mb-6 grid grid-cols-5 gap-3">
        {stats.map((stat) => (
          <Card key={stat.label} className="p-4 text-center">
            <CardContent className="p-0">
              <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {stat.label}
              </div>
              <div className="font-mono text-[20px] font-medium text-foreground">
                {stat.value}
              </div>
              {stat.delta && (
                <div className="mt-1 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  {stat.delta}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Trend chart */}
      <Card className="mb-6 p-5">
        <CardContent className="p-0">
          <h2 className="mb-4 text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
            Trend
          </h2>
          <MetricTrendChart
            dailyData={dailyData}
            unit={def.unit}
            isRatio={def.valueType === "ratio"}
            average={avg}
          />
        </CardContent>
      </Card>

      {/* Distribution + Notable Items */}
      <div className="mb-6 grid grid-cols-2 gap-3">
        <Card className="p-5">
          <CardContent className="p-0">
            <h2 className="mb-4 text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
              Distribution
            </h2>
            <Distribution data={distribution} />
          </CardContent>
        </Card>
        <Card className="p-5">
          <CardContent className="p-0">
            <h2 className="mb-4 text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
              {notableLabel}
            </h2>
            <NotableItems
              highest={highest}
              lowest={lowest}
              def={def}
              prHref={prHref}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// BooleanPanel
// ---------------------------------------------------------------------------

export function BooleanPanel({
  values,
  def,
}: {
  values: PRValue[];
  def: MetricDefEntry;
}) {
  return (
    <Card className="mb-6 p-5">
      <CardContent className="p-0">
        <h2 className="mb-4 text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
          Summary
        </h2>
        <BooleanMetricSummary
          entries={values.map((p) => ({
            prId: p.prId,
            prNumber: p.prNumber,
            title: p.title,
            value: p.value === 1,
          }))}
          trueIsBetter={!def.lowerIsBetter}
        />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Distribution
// ---------------------------------------------------------------------------

function Distribution({ data }: { data: DistBucket[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-[12px] text-muted-foreground">
        Not enough data
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {data.map((bucket) => (
        <div key={bucket.label} className="flex items-center gap-2">
          <span className="w-[72px] shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
            {bucket.label}
          </span>
          <div className="relative h-5 flex-1 overflow-hidden rounded bg-muted">
            <div
              className="absolute inset-y-0 left-0 rounded bg-clay-600 dark:bg-clay-dark-500"
              style={{
                width: `${Math.max(bucket.pct * 100, bucket.count > 0 ? 4 : 0)}%`,
                opacity: 0.75,
              }}
            />
          </div>
          <span className="w-6 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
            {bucket.count}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notable Items — renders PRs as links, sessions as plain text
// ---------------------------------------------------------------------------

function NotableItems({
  highest,
  lowest,
  def,
  prHref,
}: {
  highest: MetricValue[];
  lowest: MetricValue[];
  def: MetricDefEntry;
  prHref?: (prId: number) => string;
}) {
  if (highest.length === 0 && lowest.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-[12px] text-muted-foreground">
        Not enough data
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {highest.length > 0 && (
        <div>
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Highest
          </div>
          <ItemList entries={highest} def={def} prHref={prHref} />
        </div>
      )}
      {lowest.length > 0 && (
        <div>
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Lowest
          </div>
          <ItemList entries={lowest} def={def} prHref={prHref} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ItemList — renders PRs with links, sessions as plain rows
// ---------------------------------------------------------------------------

function ItemList({
  entries,
  def,
  prHref,
}: {
  entries: MetricValue[];
  def: MetricDefEntry;
  prHref?: (prId: number) => string;
}) {
  return (
    <div className="space-y-0.5">
      {entries.map((item) => {
        if (isPRValue(item)) {
          const content = (
            <>
              <span className="shrink-0 font-medium text-primary">
                #{item.prNumber}
              </span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {item.title}
              </span>
              <span className="shrink-0 font-mono text-foreground">
                {formatMetricValue(item.value, def)}
              </span>
            </>
          );

          if (prHref) {
            return (
              <Link
                key={item.prId}
                href={prHref(item.prId)}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-[12px] transition-colors hover:bg-accent"
              >
                {content}
              </Link>
            );
          }

          return (
            <div
              key={item.prId}
              className="flex items-center gap-2 rounded px-2 py-1.5 text-[12px]"
            >
              {content}
            </div>
          );
        }

        // Session item
        const session = item as SessionValue;
        return (
          <div
            key={session.sessionId}
            className="flex items-center gap-2 rounded px-2 py-1.5 text-[12px]"
          >
            <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground">
              {session.label}
            </span>
            <span className="shrink-0 font-mono text-foreground">
              {formatMetricValue(session.value, def)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
