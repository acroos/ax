import type { PRWithMetrics } from "./db";
import { formatMetricValue, type MetricDefEntry } from "./metric-defs";
import type { Range } from "@/components/range-toggle";
import type { DailyPoint } from "@/components/metric-trend-chart";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const RANGE_DAYS: Record<Range, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PRValue {
  prId: number;
  prNumber: number;
  title: string;
  value: number;
  state: string;
  timestamp: number;
}

export interface DistBucket {
  label: string;
  count: number;
  pct: number;
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

function getTimestamp(pr: PRWithMetrics): number | null {
  const dateStr = pr.merged_at ?? pr.closed_at ?? pr.created_at;
  if (!dateStr) return null;
  return new Date(dateStr).getTime();
}

export function extractPRValues(
  prs: PRWithMetrics[],
  def: MetricDefEntry,
): PRValue[] {
  const values: PRValue[] = [];
  for (const pr of prs) {
    if (!pr.metrics) continue;
    const raw = pr.metrics[def.field];
    if (raw === null || raw === undefined) continue;
    const ts = getTimestamp(pr);
    if (!ts) continue;
    values.push({
      prId: pr.id,
      prNumber: pr.number,
      title: pr.title || `PR #${pr.number}`,
      value: raw as number,
      state: pr.state || "unknown",
      timestamp: ts,
    });
  }
  return values.sort((a, b) => a.timestamp - b.timestamp);
}

export function filterByRange(values: PRValue[], range: Range): PRValue[] {
  const days = RANGE_DAYS[range];
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return values.filter((v) => v.timestamp >= cutoff);
}

/** Group PRs by calendar day and compute per-day averages + ranges. */
export function aggregateByDay(values: PRValue[]): DailyPoint[] {
  const byDay = new Map<string, { vals: number[]; ts: number }>();
  for (const v of values) {
    const dayKey = new Date(v.timestamp).toISOString().slice(0, 10);
    const existing = byDay.get(dayKey);
    if (existing) {
      existing.vals.push(v.value);
    } else {
      byDay.set(dayKey, {
        vals: [v.value],
        ts: new Date(dayKey + "T12:00:00Z").getTime(),
      });
    }
  }
  return [...byDay.values()]
    .map((d) => {
      const avg = d.vals.reduce((s, v) => s + v, 0) / d.vals.length;
      const min = Math.min(...d.vals);
      const max = Math.max(...d.vals);
      return {
        timestamp: d.ts,
        avg,
        min,
        max,
        count: d.vals.length,
        range: [avg - min, max - avg] as [number, number],
      };
    })
    .sort((a, b) => a.timestamp - b.timestamp);
}

// ---------------------------------------------------------------------------
// Distribution bucketing
// ---------------------------------------------------------------------------

export function computeDistribution(
  values: number[],
  def: MetricDefEntry,
): DistBucket[] {
  if (values.length === 0) return [];

  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  if (def.valueType === "ratio") {
    const bands = Array.from({ length: 10 }, (_, i) => ({
      label: `${i * 10}\u2013${(i + 1) * 10}%`,
      count: 0,
    }));
    for (const v of values) {
      bands[Math.min(Math.floor(v * 10), 9)].count++;
    }
    const first = bands.findIndex((b) => b.count > 0);
    const last = bands.findLastIndex((b) => b.count > 0);
    const trimmed = bands.slice(first, last + 1);
    const maxCount = Math.max(...trimmed.map((b) => b.count));
    return trimmed.map((b) => ({
      label: b.label,
      count: b.count,
      pct: maxCount > 0 ? b.count / maxCount : 0,
    }));
  }

  const range = max - min;
  if (range === 0) {
    return [
      { label: formatMetricValue(min, def), count: values.length, pct: 1 },
    ];
  }

  const targetBuckets = 6;
  let step: number;

  if (def.valueType === "int") {
    step = Math.max(1, Math.ceil(range / targetBuckets));
  } else {
    const raw = range / targetBuckets;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    step = Math.ceil(raw / mag) * mag;
  }

  const bucketStart = Math.floor(min / step) * step;
  const buckets: { label: string; count: number }[] = [];

  for (let lo = bucketStart; lo <= max; lo += step) {
    const hi = lo + step;
    const isLast = hi > max;
    const count = values.filter(
      (v) => v >= lo && (isLast ? v <= hi : v < hi),
    ).length;

    let label: string;
    if (def.valueType === "int" && step === 1) {
      label = String(Math.round(lo));
    } else if (def.unit === "$") {
      label = `$${lo.toFixed(0)}\u2013$${hi.toFixed(0)}`;
    } else if (def.valueType === "int") {
      label = `${Math.round(lo)}\u2013${Math.round(hi - 1)}`;
    } else {
      label = `${lo.toFixed(1)}\u2013${hi.toFixed(1)}`;
    }

    buckets.push({ label, count });
  }

  const first = buckets.findIndex((b) => b.count > 0);
  const last = buckets.findLastIndex((b) => b.count > 0);
  const trimmed = buckets.slice(first, last + 1);
  const maxCount = Math.max(...trimmed.map((b) => b.count));
  return trimmed.map((b) => ({
    label: b.label,
    count: b.count,
    pct: maxCount > 0 ? b.count / maxCount : 0,
  }));
}
