import type { SparklinePoint } from "@/lib/db";

/**
 * Minimal SVG sparkline. Breaks the line on null values (gaps).
 * Returns null when there's no meaningful data to show.
 *
 * When `showArea` is true, renders a subtle filled area under each
 * contiguous line segment for visual weight at larger sizes.
 */
export function Sparkline({
  data,
  className = "",
  showArea = true,
}: {
  data: SparklinePoint[];
  className?: string;
  showArea?: boolean;
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

  // Build path segments, breaking on null. Track start/end x for area paths.
  const lineSegments: string[] = [];
  const areaSegments: string[] = [];
  let current = "";
  let segStartX = 0;
  let segEndX = 0;

  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === null) {
      if (current) {
        lineSegments.push(current);
        if (showArea) {
          areaSegments.push(
            `${current} L${segEndX.toFixed(1)},${height} L${segStartX.toFixed(1)},${height} Z`,
          );
        }
        current = "";
      }
      continue;
    }
    const x = scaleX(i);
    const y = scaleY(v);
    const xStr = x.toFixed(1);
    const yStr = y.toFixed(1);
    if (!current) {
      segStartX = x;
      current = `M${xStr},${yStr}`;
    } else {
      current += ` L${xStr},${yStr}`;
    }
    segEndX = x;
  }
  if (current) {
    lineSegments.push(current);
    if (showArea) {
      areaSegments.push(
        `${current} L${segEndX.toFixed(1)},${height} L${segStartX.toFixed(1)},${height} Z`,
      );
    }
  }

  if (lineSegments.length === 0) return null;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={`text-muted-foreground ${className}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      {showArea &&
        areaSegments.map((d, i) => (
          <path key={`a${i}`} d={d} fill="currentColor" opacity={0.08} />
        ))}
      <path
        d={lineSegments.join(" ")}
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
