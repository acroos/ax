import type { SparklinePoint } from "@/lib/db";

/**
 * Minimal SVG sparkline. Skips null values and connects through them
 * so the line remains continuous even when days have missing data.
 * Returns null when there's no meaningful data to show.
 *
 * When `showArea` is true, renders a subtle filled area under the
 * line for visual weight at larger sizes.
 *
 * Pass `label` to provide a screen-reader-accessible description of
 * the metric name; the component computes and announces the trend
 * direction (up/down/flat) automatically.
 */
export function Sparkline({
  data,
  className = "",
  showArea = true,
  label,
}: {
  data: SparklinePoint[];
  className?: string;
  showArea?: boolean;
  label?: string;
}) {
  const values = data.map((d) => d.v);
  const nonNull = values.filter((v): v is number => v !== null);

  // Nothing to draw, or flat line (all same value)
  if (nonNull.length < 2) return null;

  const min = Math.min(...nonNull);
  const max = Math.max(...nonNull);

  const width = 200;
  const height = 64;
  const padY = 6;

  const range = max - min;
  const scaleY = (v: number) =>
    range === 0
      ? height / 2
      : padY + (1 - (v - min) / range) * (height - padY * 2);
  const scaleX = (i: number) => (i / (values.length - 1)) * width;

  // Build a single continuous path, skipping null values.
  let linePath = "";
  let startX = 0;
  let endX = 0;

  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === null) continue;
    const x = scaleX(i);
    const y = scaleY(v);
    const xStr = x.toFixed(1);
    const yStr = y.toFixed(1);
    if (!linePath) {
      startX = x;
      linePath = `M${xStr},${yStr}`;
    } else {
      linePath += ` L${xStr},${yStr}`;
    }
    endX = x;
  }

  if (!linePath) return null;

  const areaPath = showArea
    ? `${linePath} L${endX.toFixed(1)},${height} L${startX.toFixed(1)},${height} Z`
    : "";

  // Compute trend direction for screen readers
  const first = nonNull[0];
  const last = nonNull[nonNull.length - 1];
  const trend = last > first ? "trending up" : last < first ? "trending down" : "flat";
  const ariaLabel = label ? `${label}, ${trend}` : undefined;

  return (
    <span aria-label={ariaLabel} role={ariaLabel ? "img" : undefined}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={`text-muted-foreground ${className}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {showArea && areaPath && (
          <path d={areaPath} fill="currentColor" opacity={0.08} />
        )}
        <path
          d={linePath}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </span>
  );
}
