"use client";

import { useRouter } from "next/navigation";
import {
  ComposedChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import {
  ChartConfig,
  ChartContainer,
} from "@/components/ui/chart";
import { chartColor, themeVar } from "@/lib/chart-theme";

export type ChartSlot = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface TrendPoint {
  timestamp: number;
  value: number;
  rollingAvg: number;
  prNumber: number;
  prId: number;
  title: string;
}

interface MetricTrendChartProps {
  data: TrendPoint[];
  colorSlot?: ChartSlot;
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
  payload?: Array<{ payload: TrendPoint }>;
  fmt: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-md">
      <div className="text-[13px] font-medium text-popover-foreground">
        PR #{point.prNumber}
      </div>
      <div className="mb-1.5 text-[11px] text-muted-foreground">
        {new Date(point.timestamp).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </div>
      <div className="space-y-0.5">
        <div className="flex items-center justify-between gap-4 text-[12px]">
          <span className="text-muted-foreground">Value</span>
          <span className="font-mono font-medium text-popover-foreground">
            {fmt(point.value)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4 text-[12px]">
          <span className="text-muted-foreground">Trend</span>
          <span className="font-mono text-muted-foreground">
            {fmt(point.rollingAvg)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function MetricTrendChart({
  data,
  colorSlot = 1,
  unit = "",
  height = 280,
  isRatio = false,
  average,
}: MetricTrendChartProps) {
  const router = useRouter();

  if (data.length === 0) {
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

  const config: ChartConfig = {
    value: {
      label: "Value",
      color: chartColor(colorSlot),
    },
    rollingAvg: {
      label: "Trend",
      color: chartColor(colorSlot),
    },
  };

  return (
    <ChartContainer
      config={config}
      className="aspect-auto w-full"
      style={{ height }}
    >
      <ComposedChart
        data={data}
        margin={{ top: 8, right: 32, bottom: 0, left: -20 }}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onClick={(state: any) => {
          if (state?.activePayload?.[0]?.payload?.prId) {
            router.push(`/prs/${state.activePayload[0].payload.prId}`);
          }
        }}
        style={{ cursor: "pointer" }}
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
        <Tooltip
          content={<TrendTooltip fmt={fmt} />}
        />
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
        {/* Rolling average — rendered first so dots layer on top */}
        <Line
          dataKey="rollingAvg"
          stroke="var(--color-rollingAvg)"
          strokeWidth={2}
          strokeOpacity={0.45}
          dot={false}
          type="monotone"
          isAnimationActive={false}
          connectNulls
        />
        {/* Individual values as dots */}
        <Line
          dataKey="value"
          stroke="transparent"
          strokeWidth={0}
          dot={{
            r: 4,
            fill: "var(--color-value)",
            fillOpacity: 0.85,
            strokeWidth: 0,
          }}
          activeDot={{
            r: 6,
            fill: "var(--color-value)",
            stroke: themeVar("card"),
            strokeWidth: 2,
          }}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ChartContainer>
  );
}
