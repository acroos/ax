"use client";

import { Bar, BarChart, ReferenceLine, XAxis, YAxis } from "recharts";
import { useRouter } from "next/navigation";

import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { chartColor } from "@/lib/chart-theme";

/**
 * Chart slot 1..8 per THEME.md §3. Slot 1 (clay) is the default series; use
 * 2..8 when multiple series need to be distinguishable.
 */
export type ChartSlot = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

interface DataPoint {
  label: string;
  value: number;
  prId: number;
}

interface MetricBarChartProps {
  data: DataPoint[];
  colorSlot?: ChartSlot;
  unit?: string;
  height?: number;
  isRatio?: boolean;
}

export function MetricBarChart({
  data,
  colorSlot = 1,
  unit = "",
  height = 240,
  isRatio = false,
}: MetricBarChartProps) {
  const router = useRouter();

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-[12px] text-muted-foreground"
        style={{ height }}
      >
        No data available
      </div>
    );
  }

  const avg = data.reduce((s, d) => s + d.value, 0) / data.length;

  const fmt = (v: number) => {
    if (isRatio) return `${Math.round(v * 100)}%`;
    if (unit === "$") return `$${v.toFixed(2)}`;
    return String(Math.round(v * 100) / 100);
  };

  const tickFormatter = isRatio
    ? (v: number) => `${Math.round(v * 100)}%`
    : unit === "$"
      ? (v: number) => `$${v}`
      : undefined;

  const config: ChartConfig = {
    value: {
      label: "Value",
      color: chartColor(colorSlot),
    },
  };

  return (
    <ChartContainer
      config={config}
      className="aspect-auto w-full"
      style={{ height }}
    >
      <BarChart
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
          dataKey="label"
          tick={{ fontSize: 10 }}
          tickLine={false}
          axisLine={{ stroke: "var(--color-border)" }}
          interval={data.length > 20 ? Math.floor(data.length / 10) : 0}
        />
        <YAxis
          tick={{ fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          width={50}
          tickFormatter={tickFormatter}
          domain={isRatio ? [0, 1] : undefined}
        />
        <ChartTooltip
          cursor={{ fill: "var(--color-muted)", opacity: 0.6 }}
          content={
            <ChartTooltipContent
              hideLabel={false}
              formatter={(value) => [fmt(value as number), ""]}
            />
          }
        />
        <ReferenceLine
          y={avg}
          stroke="var(--color-muted-foreground)"
          strokeDasharray="4 4"
          strokeWidth={1}
          label={{
            value: `avg: ${fmt(avg)}`,
            position: "right",
            fill: "var(--color-muted-foreground)",
            fontSize: 10,
          }}
        />
        <Bar
          dataKey="value"
          fill="var(--color-value)"
          fillOpacity={0.85}
          radius={[3, 3, 0, 0]}
        />
      </BarChart>
    </ChartContainer>
  );
}
