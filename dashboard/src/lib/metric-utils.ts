import type {
  PRWithMetrics,
  SessionWithMetrics,
  SessionMetrics,
  MetricDetailTrendPoint,
  MetricDetailDistBucket,
  NotableItem,
} from "./db";
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

export interface SessionValue {
  sessionId: string;
  label: string;
  value: number;
  timestamp: number;
}

/** Union type for metric detail page values — either PR or session sourced. */
export type MetricValue = PRValue | SessionValue;

export function isPRValue(v: MetricValue): v is PRValue {
  return "prId" in v;
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

export function extractSessionValues(
  sessions: SessionWithMetrics[],
  def: MetricDefEntry,
): SessionValue[] {
  const field = def.field as keyof SessionMetrics;
  const values: SessionValue[] = [];
  for (const s of sessions) {
    const raw = s.metrics[field];
    if (raw === null || raw === undefined) continue;
    const dateStr = s.ended_at ?? s.started_at;
    if (!dateStr) continue;
    const ts = new Date(dateStr).getTime();
    const label = s.branch
      ? s.branch
      : new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    values.push({
      sessionId: s.id,
      label,
      value: raw as number,
      timestamp: ts,
    });
  }
  return values.sort((a, b) => a.timestamp - b.timestamp);
}

export function filterSessionsByRange(values: SessionValue[], range: Range): SessionValue[] {
  const days = RANGE_DAYS[range];
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return values.filter((v) => v.timestamp >= cutoff);
}

export function filterByRange(values: PRValue[], range: Range): PRValue[] {
  const days = RANGE_DAYS[range];
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return values.filter((v) => v.timestamp >= cutoff);
}

/** Group values by calendar day and compute per-day averages + ranges. */
export function aggregateByDay(values: MetricValue[]): DailyPoint[] {
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

// ---------------------------------------------------------------------------
// Compute metric detail from raw values (for demo pages)
// ---------------------------------------------------------------------------

/** Shape matching MetricDetailBodyProps data, usable by both API responses and local computation. */
export interface ComputedMetricDetail {
  count: number;
  totalCount: number;
  stats: { avg: number; p10: number; p50: number; p90: number };
  priorStats: { avg: number; p10: number; p50: number; p90: number } | null;
  trend: MetricDetailTrendPoint[];
  distribution: MetricDetailDistBucket[];
  notableHighest: NotableItem[];
  notableLowest: NotableItem[];
}

/**
 * Compute all metric detail data from raw values — used by demo pages
 * to produce the same shape as the server-side MetricDetailComputer.
 */
export function computeMetricDetailFromValues(
  values: MetricValue[],
  allValues: MetricValue[],
  def: MetricDefEntry,
  range: Range,
): ComputedMetricDetail {
  const numericValues = values.map((v) => v.value);
  const sorted = [...numericValues].sort((a, b) => a - b);
  const avg = numericValues.length > 0
    ? numericValues.reduce((s, v) => s + v, 0) / numericValues.length
    : 0;
  const p10 = percentile(sorted, 10);
  const p50 = percentile(sorted, 50);
  const p90 = percentile(sorted, 90);

  // Prior period values
  const days = RANGE_DAYS[range];
  const rangeStart = Date.now() - days * 24 * 60 * 60 * 1000;
  const priorStart = rangeStart - days * 24 * 60 * 60 * 1000;
  const priorValues = allValues.filter(
    (v) => v.timestamp >= priorStart && v.timestamp < rangeStart,
  );
  const priorNums = priorValues.map((v) => v.value);
  const priorSorted = [...priorNums].sort((a, b) => a - b);

  const priorStats = priorNums.length > 0
    ? {
        avg: priorNums.reduce((s, v) => s + v, 0) / priorNums.length,
        p10: percentile(priorSorted, 10),
        p50: percentile(priorSorted, 50),
        p90: percentile(priorSorted, 90),
      }
    : null;

  // Trend — aggregate by day into API-compatible shape
  const dailyPoints = aggregateByDay(values);
  const trend: MetricDetailTrendPoint[] = dailyPoints.map((d) => ({
    date: new Date(d.timestamp).toISOString().slice(0, 10),
    avg: d.avg,
    min: d.min,
    max: d.max,
    count: d.count,
  }));

  // Distribution
  const distribution: MetricDetailDistBucket[] = computeDistribution(numericValues, def);

  // Notable items
  const byValue = [...values].sort((a, b) => b.value - a.value);
  const highest = byValue.slice(0, 3);
  const highestIds = new Set(
    highest.map((v) => isPRValue(v) ? v.prId : (v as SessionValue).sessionId),
  );
  const lowest = byValue
    .slice(-3)
    .reverse()
    .filter((v) => {
      const id = isPRValue(v) ? v.prId : (v as SessionValue).sessionId;
      return !highestIds.has(id);
    });

  const toNotable = (v: MetricValue): NotableItem => {
    if (isPRValue(v)) {
      return { id: v.prId, number: v.prNumber, title: v.title, value: v.value, state: v.state };
    }
    const s = v as SessionValue;
    return { id: s.sessionId, label: s.label, value: s.value };
  };

  return {
    count: values.length,
    totalCount: allValues.length,
    stats: { avg, p10, p50, p90 },
    priorStats,
    trend,
    distribution,
    notableHighest: highest.map(toNotable),
    notableLowest: lowest.map(toNotable),
  };
}
