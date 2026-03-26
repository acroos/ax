"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { useRouter } from "next/navigation";

interface DataPoint {
  label: string;
  value: number;
  prId: number;
}

interface MetricBarChartProps {
  data: DataPoint[];
  color?: string;
  unit?: string;
  height?: number;
  isRatio?: boolean;
}

export function MetricBarChart({
  data,
  color = "#6366F1",
  unit = "",
  height = 240,
  isRatio = false,
}: MetricBarChartProps) {
  const router = useRouter();

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-text-tertiary text-[12px]"
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

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        margin={{ top: 8, right: 4, bottom: 0, left: -20 }}
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
          tick={{ fontSize: 10, fill: "#56566A" }}
          axisLine={{ stroke: "#252536" }}
          tickLine={false}
          interval={data.length > 20 ? Math.floor(data.length / 10) : 0}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "#56566A" }}
          axisLine={false}
          tickLine={false}
          width={50}
          tickFormatter={tickFormatter}
          domain={isRatio ? [0, 1] : undefined}
        />
        <Tooltip
          contentStyle={{
            background: "#1F1F2E",
            border: "1px solid #252536",
            borderRadius: "8px",
            fontSize: "12px",
            color: "#E8E8ED",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          }}
          labelStyle={{ color: "#8B8B9E", marginBottom: "4px" }}
          formatter={(value) => [fmt(value as number), ""]}
          cursor={{ fill: "rgba(255,255,255,0.03)" }}
        />
        <ReferenceLine
          y={avg}
          stroke="#8B8B9E"
          strokeDasharray="4 4"
          strokeWidth={1}
          label={{
            value: `avg: ${fmt(avg)}`,
            position: "right",
            fill: "#8B8B9E",
            fontSize: 10,
          }}
        />
        <Bar
          dataKey="value"
          fill={color}
          fillOpacity={0.7}
          radius={[3, 3, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
