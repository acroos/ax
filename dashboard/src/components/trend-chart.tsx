"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface TrendChartProps {
  data: { label: string; value: number }[];
  color?: string;
  unit?: string;
  height?: number;
}

export function TrendChart({
  data,
  color = "#6366F1",
  unit = "",
  height = 160,
}: TrendChartProps) {
  if (data.length < 2) {
    return (
      <div
        className="flex items-center justify-center text-text-tertiary text-[12px]"
        style={{ height }}
      >
        Need 2+ data points for trends
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
        <defs>
          <linearGradient id={`gradient-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.2} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: "#56566A" }}
          axisLine={{ stroke: "#252536" }}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 10, fill: "#56566A" }}
          axisLine={false}
          tickLine={false}
          width={40}
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
          formatter={(value) => [`${value}${unit}`, ""]}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#gradient-${color.replace("#", "")})`}
          dot={{ r: 3, fill: color, strokeWidth: 0 }}
          activeDot={{ r: 4, fill: color, stroke: "#0C0C14", strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

interface SparklineProps {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}

export function Sparkline({
  data,
  color = "#6366F1",
  width = 80,
  height = 24,
}: SparklineProps) {
  if (data.length < 2) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} className="flex-shrink-0">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
