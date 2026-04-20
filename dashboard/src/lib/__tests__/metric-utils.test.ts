import { describe, it, expect, vi, afterEach } from "vitest";
import {
  percentile,
  extractPRValues,
  filterByRange,
  aggregateByDay,
  computeDistribution,
  RANGE_DAYS,
} from "../metric-utils";
import type { PRWithMetrics } from "../db";
import type { MetricDefEntry } from "../metric-defs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePR(overrides: Partial<PRWithMetrics> = {}): PRWithMetrics {
  return {
    id: 1,
    repo_id: 1,
    number: 100,
    title: "Test PR",
    branch: "feature",
    state: "merged",
    created_at: "2026-01-15T00:00:00Z",
    merged_at: "2026-01-16T00:00:00Z",
    closed_at: null,
    url: null,
    additions: 50,
    deletions: 20,
    changed_files: 3,
    metrics: {
      pr_id: 1,
      iteration_depth: 5,
      post_open_commits: 2,
      ci_success_rate: 0.8,
      line_revisit_rate: 1.5,
      token_cost_usd: 3.5,
      cache_hit_rate: 0.6,
      sidechain_rate: 0.1,
      re_read_rate: 2.0,
      autonomy_score: 7.5,
      metrics_finalized: true,
      finalized_at: "2026-01-16T00:00:00Z",
    },
    author: "testuser",
    github_owner: "org",
    github_repo: "repo",
    session_count: 1,
    ...overrides,
  };
}

function defWithType(
  valueType: MetricDefEntry["valueType"],
  overrides: Partial<MetricDefEntry> = {},
): MetricDefEntry {
  return {
    slug: "test",
    docSlug: "test",
    field: "post_open_commits",
    label: "Test",
    category: "Output Quality",
    valueType,
    lowerIsBetter: true,
    tooltip: "test",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// percentile
// ---------------------------------------------------------------------------

describe("percentile", () => {
  it("returns 0 for empty array", () => {
    expect(percentile([], 50)).toBe(0);
  });

  it("returns the single value for a single-element array", () => {
    expect(percentile([42], 0)).toBe(42);
    expect(percentile([42], 50)).toBe(42);
    expect(percentile([42], 100)).toBe(42);
  });

  it("returns min at p0 and max at p100", () => {
    const sorted = [1, 2, 3, 4, 5];
    expect(percentile(sorted, 0)).toBe(1);
    expect(percentile(sorted, 100)).toBe(5);
  });

  it("returns median for p50 with odd count", () => {
    expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
  });

  it("interpolates for p50 with even count", () => {
    expect(percentile([1, 2, 3, 4], 50)).toBe(2.5);
  });

  it("computes p10 and p90", () => {
    const sorted = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const p10 = percentile(sorted, 10);
    const p90 = percentile(sorted, 90);
    expect(p10).toBeCloseTo(19, 0);
    expect(p90).toBeCloseTo(91, 0);
  });
});

// ---------------------------------------------------------------------------
// extractPRValues
// ---------------------------------------------------------------------------

describe("extractPRValues", () => {
  const intDef = defWithType("int", {
    slug: "post-open-commits",
    field: "post_open_commits",
  });

  it("returns empty array for no PRs", () => {
    expect(extractPRValues([], intDef)).toEqual([]);
  });

  it("skips PRs without metrics", () => {
    const prs = [makePR({ metrics: null })];
    expect(extractPRValues(prs, intDef)).toHaveLength(0);
  });

  it("skips PRs where the specific field is null", () => {
    const prs = [
      makePR({
        metrics: {
          ...makePR().metrics!,
          post_open_commits: null,
        },
      }),
    ];
    expect(extractPRValues(prs, intDef)).toHaveLength(0);
  });

  it("skips PRs with no timestamp", () => {
    const prs = [
      makePR({ merged_at: null, closed_at: null, created_at: null }),
    ];
    expect(extractPRValues(prs, intDef)).toHaveLength(0);
  });

  it("extracts values from valid PRs", () => {
    const prs = [makePR()];
    const values = extractPRValues(prs, intDef);
    expect(values).toHaveLength(1);
    expect(values[0].prId).toBe(1);
    expect(values[0].value).toBe(2);
    expect(values[0].prNumber).toBe(100);
  });

  it("uses merged_at as timestamp preference", () => {
    const prs = [
      makePR({
        created_at: "2026-01-01T00:00:00Z",
        merged_at: "2026-01-03T00:00:00Z",
        closed_at: "2026-01-02T00:00:00Z",
      }),
    ];
    const values = extractPRValues(prs, intDef);
    expect(values[0].timestamp).toBe(
      new Date("2026-01-03T00:00:00Z").getTime(),
    );
  });

  it("falls back to closed_at then created_at", () => {
    const prClosed = makePR({
      id: 1,
      merged_at: null,
      closed_at: "2026-01-02T00:00:00Z",
      created_at: "2026-01-01T00:00:00Z",
    });
    const prCreated = makePR({
      id: 2,
      number: 101,
      merged_at: null,
      closed_at: null,
      created_at: "2026-01-01T00:00:00Z",
    });
    const valuesClosed = extractPRValues([prClosed], intDef);
    expect(valuesClosed[0].timestamp).toBe(
      new Date("2026-01-02T00:00:00Z").getTime(),
    );
    const valuesCreated = extractPRValues([prCreated], intDef);
    expect(valuesCreated[0].timestamp).toBe(
      new Date("2026-01-01T00:00:00Z").getTime(),
    );
  });

  it("sorts by timestamp ascending", () => {
    const prs = [
      makePR({ id: 1, merged_at: "2026-01-03T00:00:00Z" }),
      makePR({ id: 2, number: 101, merged_at: "2026-01-01T00:00:00Z" }),
      makePR({ id: 3, number: 102, merged_at: "2026-01-02T00:00:00Z" }),
    ];
    const values = extractPRValues(prs, intDef);
    expect(values.map((v) => v.prId)).toEqual([2, 3, 1]);
  });

  it("uses PR number as title fallback", () => {
    const prs = [makePR({ title: null, number: 42 })];
    const values = extractPRValues(prs, intDef);
    expect(values[0].title).toBe("PR #42");
  });
});

// ---------------------------------------------------------------------------
// filterByRange
// ---------------------------------------------------------------------------

describe("filterByRange", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("filters values within the 7d range", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-20T12:00:00Z"));

    const values = [
      { prId: 1, prNumber: 1, title: "old", value: 1, state: "merged", timestamp: new Date("2026-01-10T00:00:00Z").getTime() },
      { prId: 2, prNumber: 2, title: "recent", value: 2, state: "merged", timestamp: new Date("2026-01-18T00:00:00Z").getTime() },
      { prId: 3, prNumber: 3, title: "today", value: 3, state: "merged", timestamp: new Date("2026-01-20T00:00:00Z").getTime() },
    ];

    const result = filterByRange(values, "7d");
    expect(result).toHaveLength(2);
    expect(result.map((v) => v.prId)).toEqual([2, 3]);
  });

  it("returns all values when all are within range", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-20T12:00:00Z"));

    const values = [
      { prId: 1, prNumber: 1, title: "a", value: 1, state: "merged", timestamp: new Date("2026-01-19T00:00:00Z").getTime() },
    ];

    expect(filterByRange(values, "90d")).toHaveLength(1);
  });

  it("returns empty when all values are out of range", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T00:00:00Z"));

    const values = [
      { prId: 1, prNumber: 1, title: "a", value: 1, state: "merged", timestamp: new Date("2026-01-01T00:00:00Z").getTime() },
    ];

    expect(filterByRange(values, "7d")).toHaveLength(0);
    expect(filterByRange(values, "30d")).toHaveLength(0);
    expect(filterByRange(values, "90d")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// RANGE_DAYS
// ---------------------------------------------------------------------------

describe("RANGE_DAYS", () => {
  it("maps ranges to correct day counts", () => {
    expect(RANGE_DAYS["7d"]).toBe(7);
    expect(RANGE_DAYS["30d"]).toBe(30);
    expect(RANGE_DAYS["90d"]).toBe(90);
  });
});

// ---------------------------------------------------------------------------
// aggregateByDay
// ---------------------------------------------------------------------------

describe("aggregateByDay", () => {
  it("returns empty array for no values", () => {
    expect(aggregateByDay([])).toEqual([]);
  });

  it("groups multiple values on the same day", () => {
    const values = [
      { prId: 1, prNumber: 1, title: "a", value: 10, state: "merged", timestamp: new Date("2026-01-15T08:00:00Z").getTime() },
      { prId: 2, prNumber: 2, title: "b", value: 20, state: "merged", timestamp: new Date("2026-01-15T16:00:00Z").getTime() },
    ];
    const result = aggregateByDay(values);
    expect(result).toHaveLength(1);
    expect(result[0].avg).toBe(15);
    expect(result[0].min).toBe(10);
    expect(result[0].max).toBe(20);
    expect(result[0].count).toBe(2);
  });

  it("separates values on different days", () => {
    const values = [
      { prId: 1, prNumber: 1, title: "a", value: 10, state: "merged", timestamp: new Date("2026-01-15T12:00:00Z").getTime() },
      { prId: 2, prNumber: 2, title: "b", value: 20, state: "merged", timestamp: new Date("2026-01-16T12:00:00Z").getTime() },
    ];
    const result = aggregateByDay(values);
    expect(result).toHaveLength(2);
    expect(result[0].avg).toBe(10);
    expect(result[1].avg).toBe(20);
  });

  it("sorts by timestamp ascending", () => {
    const values = [
      { prId: 1, prNumber: 1, title: "a", value: 30, state: "merged", timestamp: new Date("2026-01-17T12:00:00Z").getTime() },
      { prId: 2, prNumber: 2, title: "b", value: 10, state: "merged", timestamp: new Date("2026-01-15T12:00:00Z").getTime() },
    ];
    const result = aggregateByDay(values);
    expect(result[0].avg).toBe(10);
    expect(result[1].avg).toBe(30);
  });

  it("computes range tuple correctly", () => {
    const values = [
      { prId: 1, prNumber: 1, title: "a", value: 2, state: "merged", timestamp: new Date("2026-01-15T08:00:00Z").getTime() },
      { prId: 2, prNumber: 2, title: "b", value: 8, state: "merged", timestamp: new Date("2026-01-15T16:00:00Z").getTime() },
    ];
    const result = aggregateByDay(values);
    // avg = 5, min = 2, max = 8
    // range = [avg - min, max - avg] = [3, 3]
    expect(result[0].range).toEqual([3, 3]);
  });
});

// ---------------------------------------------------------------------------
// computeDistribution
// ---------------------------------------------------------------------------

describe("computeDistribution", () => {
  it("returns empty array for no values", () => {
    const def = defWithType("int");
    expect(computeDistribution([], def)).toEqual([]);
  });

  describe("ratio values", () => {
    const def = defWithType("ratio");

    it("buckets into percentage bands", () => {
      const values = [0.05, 0.15, 0.25, 0.85, 0.95];
      const result = computeDistribution(values, def);
      // Should have bands from 0-10% to 90-100%, trimmed to non-empty
      expect(result.length).toBeGreaterThanOrEqual(1);
      // First bucket should contain the 0.05 value
      expect(result[0].label).toBe("0\u201310%");
      expect(result[0].count).toBe(1);
    });

    it("handles all values in one band", () => {
      const values = [0.51, 0.55, 0.59];
      const result = computeDistribution(values, def);
      expect(result).toHaveLength(1);
      expect(result[0].label).toBe("50\u201360%");
      expect(result[0].count).toBe(3);
      expect(result[0].pct).toBe(1);
    });

    it("handles value of exactly 1.0", () => {
      const values = [1.0];
      const result = computeDistribution(values, def);
      // 1.0 should land in the 90-100% band (Math.min(Math.floor(1.0*10), 9) = 9)
      expect(result).toHaveLength(1);
      expect(result[0].label).toBe("90\u2013100%");
      expect(result[0].count).toBe(1);
    });

    it("handles value of exactly 0.0", () => {
      const values = [0.0];
      const result = computeDistribution(values, def);
      expect(result).toHaveLength(1);
      expect(result[0].label).toBe("0\u201310%");
    });

    it("trims empty bands from edges", () => {
      const values = [0.31, 0.35, 0.55];
      const result = computeDistribution(values, def);
      expect(result[0].label).toBe("30\u201340%");
      expect(result[result.length - 1].label).toBe("50\u201360%");
    });

    it("computes pct relative to max bucket count", () => {
      const values = [0.11, 0.15, 0.55];
      const result = computeDistribution(values, def);
      const band10 = result.find((b) => b.label === "10\u201320%");
      const band50 = result.find((b) => b.label === "50\u201360%");
      expect(band10!.count).toBe(2);
      expect(band10!.pct).toBe(1); // max count
      expect(band50!.count).toBe(1);
      expect(band50!.pct).toBe(0.5);
    });
  });

  describe("single value (range === 0)", () => {
    it("returns a single bucket for int", () => {
      const def = defWithType("int");
      const result = computeDistribution([5, 5, 5], def);
      expect(result).toHaveLength(1);
      expect(result[0].label).toBe("5");
      expect(result[0].count).toBe(3);
      expect(result[0].pct).toBe(1);
    });

    it("returns a single bucket for float", () => {
      const def = defWithType("float");
      const result = computeDistribution([1.5, 1.5], def);
      expect(result).toHaveLength(1);
      expect(result[0].label).toBe("1.50");
      expect(result[0].count).toBe(2);
    });

    it("returns a single bucket for currency", () => {
      const def = defWithType("currency", { unit: "$" });
      const result = computeDistribution([3.5, 3.5], def);
      expect(result).toHaveLength(1);
      expect(result[0].label).toBe("$3.50");
    });
  });

  describe("int bucketing", () => {
    const def = defWithType("int");

    it("uses step=1 for small ranges", () => {
      const values = [1, 2, 3, 4, 5];
      const result = computeDistribution(values, def);
      // range = 4, targetBuckets = 6, step = max(1, ceil(4/6)) = 1
      expect(result.every((b) => !b.label.includes("\u2013"))).toBe(true);
      expect(result.map((b) => b.label)).toEqual(["1", "2", "3", "4", "5"]);
    });

    it("uses range labels for larger ranges", () => {
      const values = [0, 10, 20, 30, 40, 50];
      const result = computeDistribution(values, def);
      // range = 50, step = max(1, ceil(50/6)) = 9
      // All buckets should have range labels like "0–8", "9–17", etc.
      expect(result.some((b) => b.label.includes("\u2013"))).toBe(true);
    });
  });

  describe("currency bucketing", () => {
    it("uses dollar labels", () => {
      const def = defWithType("currency", { unit: "$" });
      const values = [1, 5, 10, 15, 20, 25];
      const result = computeDistribution(values, def);
      // Should have labels like "$0–$5", "$5–$10", etc.
      expect(result.every((b) => b.label.startsWith("$"))).toBe(true);
    });
  });

  describe("float bucketing", () => {
    it("uses decimal labels", () => {
      const def = defWithType("float");
      const values = [0.1, 0.5, 1.0, 1.5, 2.0, 2.5];
      const result = computeDistribution(values, def);
      // Should have labels like "0.0–0.5", "0.5–1.0", etc.
      expect(result.some((b) => b.label.includes("."))).toBe(true);
    });
  });

  describe("trimming", () => {
    it("trims empty buckets from edges", () => {
      const def = defWithType("int");
      // All values clustered in the middle should trim empty edge buckets
      const values = [10, 11, 12];
      const result = computeDistribution(values, def);
      expect(result.every((b) => b.count > 0)).toBe(true);
    });
  });
});
