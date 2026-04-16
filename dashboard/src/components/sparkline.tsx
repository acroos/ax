import type { SparklinePoint } from "@/lib/db";

/**
 * Minimal SVG sparkline. Breaks the line on null values (gaps).
 * Returns null when there's no meaningful data to show.
 */
export function Sparkline({
  data,
  className = "",
}: {
  data: SparklinePoint[];
  className?: string;
}) {
  const values = data.map((d) => d.v);
  const nonNull = values.filter((v): v is number => v !== null);

  // Nothing to draw, or flat line (all same value)
  if (nonNull.length < 2) return null;

  const min = Math.min(...nonNull);
  const max = Math.max(...nonNull);

  const width = 80;
  const height = 24;
  const padY = 2;

  const range = max - min;
  const scaleY = (v: number) =>
    range === 0
      ? height / 2
      : padY + (1 - (v - min) / range) * (height - padY * 2);
  const scaleX = (i: number) => (i / (values.length - 1)) * width;

  // Build path segments, breaking on null
  const segments: string[] = [];
  let current = "";
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === null) {
      if (current) segments.push(current);
      current = "";
      continue;
    }
    const x = scaleX(i).toFixed(1);
    const y = scaleY(v).toFixed(1);
    current += current ? ` L${x},${y}` : `M${x},${y}`;
  }
  if (current) segments.push(current);

  if (segments.length === 0) return null;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={`text-muted-foreground ${className}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        d={segments.join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
