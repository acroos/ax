"use client";

import {
  ComposedChart,
  ErrorBar,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { ChartConfig, ChartContainer } from "@/components/ui/chart";
import { themeVar } from "@/lib/chart-theme";

export interface DailyPoint {
  timestamp: number;
  avg: number;
  min: number;
  max: number;
  count: number;
  /** [avg − min, max − avg] — used by recharts ErrorBar */
  range: [number, number];
}

interface MetricTrendChartProps {
  dailyData: DailyPoint[];
  unit?: string;
  height?: number;
  isRatio?: boolean;
  average?: number;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function TrendTooltip({
  active,
  payload,
  fmt,
}: {
  active?: boolean;
  payload?: Array<{ payload: DailyPoint }>;
  fmt: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-md">
      <div className="text-[13px] font-medium text-popover-foreground">
        {formatDate(point.timestamp)}
      </div>
      <div className="mt-1 space-y-0.5">
        <div className="flex items-center justify-between gap-4 text-[12px]">
          <span className="text-muted-foreground">Daily avg</span>
          <span className="font-mono font-medium text-popover-foreground">
            {fmt(point.avg)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4 text-[12px]">
          <span className="text-muted-foreground">Range</span>
          <span className="font-mono text-muted-foreground">
            {fmt(point.min)} – {fmt(point.max)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4 text-[12px]">
          <span className="text-muted-foreground">PRs</span>
          <span className="font-mono text-muted-foreground">
            {point.count}
          </span>
        </div>
      </div>
    </div>
  );
}

export function MetricTrendChart({
  dailyData,
  unit = "",
  height = 280,
  isRatio = false,
  average,
}: MetricTrendChartProps) {
  if (dailyData.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-[13px] text-muted-foreground"
        style={{ height }}
      >
        No data available for this period
      </div>
    );
  }

  const fmt = (v: number) => {
    if (isRatio) return `${Math.round(v * 100)}%`;
    if (unit === "$") return `$${v.toFixed(2)}`;
    return String(Math.round(v * 100) / 100);
  };

  const yTickFormatter = isRatio
    ? (v: number) => `${Math.round(v * 100)}%`
    : unit === "$"
      ? (v: number) => `$${v}`
      : undefined;

  // Use darker clay for light mode (clay-600 has ~6.8:1 contrast on
  // wellstone) and brighter clay for dark mode. The default chart-1
  // slot is too warm-on-warm for thin lines in light mode.
  const config: ChartConfig = {
    avg: {
      label: "Daily Average",
      theme: {
        light: "var(--color-clay-600)",
        dark: "var(--color-clay-dark-500)",
      },
    },
  };

  return (
    <ChartContainer
      config={config}
      className="aspect-auto w-full"
      style={{ height }}
    >
      <ComposedChart
        data={dailyData}
        margin={{ top: 8, right: 32, bottom: 0, left: -20 }}
      >
        <XAxis
          dataKey="timestamp"
          type="number"
          domain={["dataMin", "dataMax"]}
          tick={{ fontSize: 10 }}
          tickLine={false}
          axisLine={{ stroke: themeVar("border") }}
          tickFormatter={formatDate}
          tickCount={6}
        />
        <YAxis
          tick={{ fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          width={50}
          tickFormatter={yTickFormatter}
          domain={isRatio ? [0, 1] : undefined}
        />
        <Tooltip content={<TrendTooltip fmt={fmt} />} />
        {average !== undefined && (
          <ReferenceLine
            y={average}
            stroke={themeVar("muted-foreground")}
            strokeDasharray="4 4"
            strokeWidth={1}
            label={{
              value: `avg: ${fmt(average)}`,
              position: "right",
              fill: themeVar("muted-foreground"),
              fontSize: 10,
            }}
          />
        )}
        {/* Daily average line with range candles */}
        <Line
          dataKey="avg"
          type="monotone"
          stroke="var(--color-avg)"
          strokeWidth={2.5}
          dot={false}
          activeDot={{
            r: 5,
            fill: "var(--color-avg)",
            stroke: themeVar("card"),
            strokeWidth: 2,
          }}
          isAnimationActive={false}
          connectNulls
        >
          {/* Renders min–max whiskers; single-PR days get width-only
              caps (a horizontal tick) since range is [0, 0]. */}
          <ErrorBar
            dataKey="range"
            width={6}
            strokeWidth={2}
            stroke="var(--color-avg)"
            opacity={0.55}
          />
        </Line>
      </ComposedChart>
    </ChartContainer>
  );
}
