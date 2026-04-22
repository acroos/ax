import Link from "next/link";

import { BooleanMetricSummary } from "@/components/boolean-metric-summary";
import { MetricTrendChart, type DailyPoint } from "@/components/metric-trend-chart";
import { Card, CardContent } from "@/components/ui/card";
import {
  formatMetricValue,
  type MetricDefEntry,
} from "@/lib/metric-defs";
import type {
  MetricDetailDistBucket,
  MetricDetailTrendPoint,
  NotableItem,
  NotablePR,
} from "@/lib/db";
import { isNotablePR } from "@/lib/db";
import type { Range } from "@/components/range-toggle";
import type { PRValue } from "@/lib/metric-utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MetricDetailBodyProps {
  count: number;
  stats: { avg: number; p10: number; p50: number; p90: number };
  priorStats: { avg: number; p10: number; p50: number; p90: number } | null;
  trend: MetricDetailTrendPoint[];
  distribution: MetricDetailDistBucket[];
  notableHighest: NotableItem[];
  notableLowest: NotableItem[];
  def: MetricDefEntry;
  range: Range;
  prHref?: (prId: number) => string;
}

// ---------------------------------------------------------------------------
// MetricDetailBody — stats, trend chart, distribution, notable items
// ---------------------------------------------------------------------------

export function MetricDetailBody({
  count,
  stats,
  priorStats,
  trend,
  distribution,
  notableHighest,
  notableLowest,
  def,
  range,
  prHref,
}: MetricDetailBodyProps) {
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

  const statCards: { label: string; value: string; delta?: string }[] = [
    { label: "Count", value: String(count) },
    {
      label: "Average",
      value: formatMetricValue(stats.avg, def),
      delta: makeDelta(stats.avg, priorStats?.avg ?? null),
    },
    {
      label: "P10",
      value: formatMetricValue(stats.p10, def),
      delta: makeDelta(stats.p10, priorStats?.p10 ?? null),
    },
    {
      label: "P50",
      value: formatMetricValue(stats.p50, def),
      delta: makeDelta(stats.p50, priorStats?.p50 ?? null),
    },
    {
      label: "P90",
      value: formatMetricValue(stats.p90, def),
      delta: makeDelta(stats.p90, priorStats?.p90 ?? null),
    },
  ];

  const dailyData: DailyPoint[] = trend
    .filter((t) => t.avg !== null)
    .map((t) => {
      const avg = t.avg!;
      const min = t.min ?? avg;
      const max = t.max ?? avg;
      return {
        timestamp: new Date(t.date + "T12:00:00Z").getTime(),
        avg,
        min,
        max,
        count: t.count,
        range: [avg - min, max - avg] as [number, number],
      };
    });

  const isSessionMetric = def.source === "session";
  const notableLabel = isSessionMetric ? "Notable Sessions" : "Notable PRs";

  return (
    <>
      {/* Summary stats */}
      <div className="mb-6 grid grid-cols-5 gap-3">
        {statCards.map((stat) => (
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
            average={stats.avg}
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
              highest={notableHighest}
              lowest={notableLowest}
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

function Distribution({ data }: { data: MetricDetailDistBucket[] }) {
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
  highest: NotableItem[];
  lowest: NotableItem[];
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
  entries: NotableItem[];
  def: MetricDefEntry;
  prHref?: (prId: number) => string;
}) {
  return (
    <div className="space-y-0.5">
      {entries.map((item) => {
        if (isNotablePR(item)) {
          const pr = item as NotablePR;
          const content = (
            <>
              <span className="shrink-0 font-medium text-primary">
                #{pr.number}
              </span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {pr.title}
              </span>
              <span className="shrink-0 font-mono text-foreground">
                {formatMetricValue(pr.value, def)}
              </span>
            </>
          );

          if (prHref) {
            return (
              <Link
                key={pr.id}
                href={prHref(pr.id)}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-[12px] transition-colors hover:bg-accent"
              >
                {content}
              </Link>
            );
          }

          return (
            <div
              key={pr.id}
              className="flex items-center gap-2 rounded px-2 py-1.5 text-[12px]"
            >
              {content}
            </div>
          );
        }

        // Session item
        return (
          <div
            key={item.id}
            className="flex items-center gap-2 rounded px-2 py-1.5 text-[12px]"
          >
            <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground">
              {item.label}
            </span>
            <span className="shrink-0 font-mono text-foreground">
              {formatMetricValue(item.value, def)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
