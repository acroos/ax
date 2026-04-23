import { describe, it, expect } from "vitest";
import {
  formatMetricValue,
  getMetricDef,
  METRIC_DEFS,
  DISPLAYED_METRICS,
  CATEGORIES,
  type MetricDefEntry,
} from "../metric-defs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defWithType(
  valueType: MetricDefEntry["valueType"],
  overrides: Partial<MetricDefEntry> = {},
): MetricDefEntry {
  return {
    slug: "test",
    docSlug: "test",
    field: "post_open_commits",
    label: "Test",
    category: "Delivery",
    valueType,
    lowerIsBetter: true,
    tooltip: "test",
    source: "pr" as const,
    displayed: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// formatMetricValue
// ---------------------------------------------------------------------------

describe("formatMetricValue", () => {
  describe("ratio", () => {
    const def = defWithType("ratio");

    it("formats 0 as 0%", () => {
      expect(formatMetricValue(0, def)).toBe("0%");
    });

    it("formats 1 as 100%", () => {
      expect(formatMetricValue(1, def)).toBe("100%");
    });

    it("formats 0.76 as 76%", () => {
      expect(formatMetricValue(0.76, def)).toBe("76%");
    });

    it("rounds to nearest percent", () => {
      expect(formatMetricValue(0.755, def)).toBe("76%");
      expect(formatMetricValue(0.744, def)).toBe("74%");
    });
  });

  describe("boolean", () => {
    const def = defWithType("boolean");

    it("formats 1 as Yes", () => {
      expect(formatMetricValue(1, def)).toBe("Yes");
    });

    it("formats 0 as No", () => {
      expect(formatMetricValue(0, def)).toBe("No");
    });
  });

  describe("currency", () => {
    const def = defWithType("currency", { unit: "$" });

    it("formats normal values with dollar sign", () => {
      expect(formatMetricValue(3.5, def)).toBe("$3.50");
    });

    it("formats values less than 0.01 as <$0.01", () => {
      expect(formatMetricValue(0.005, def)).toBe("<$0.01");
      expect(formatMetricValue(0.001, def)).toBe("<$0.01");
    });

    it("formats exactly 0.01", () => {
      expect(formatMetricValue(0.01, def)).toBe("$0.01");
    });

    it("formats zero as <$0.01", () => {
      expect(formatMetricValue(0, def)).toBe("<$0.01");
    });

    it("formats large values", () => {
      expect(formatMetricValue(123.456, def)).toBe("$123.46");
    });
  });

  describe("float", () => {
    const def = defWithType("float");

    it("formats with two decimal places", () => {
      expect(formatMetricValue(1.5, def)).toBe("1.50");
    });

    it("formats zero", () => {
      expect(formatMetricValue(0, def)).toBe("0.00");
    });

    it("rounds to two decimal places", () => {
      expect(formatMetricValue(1.999, def)).toBe("2.00");
      expect(formatMetricValue(1.234, def)).toBe("1.23");
    });
  });

  describe("float with unit=hrs (Task Cycle Time)", () => {
    const def = defWithType("float", { unit: "hrs" });

    it("formats values >= 1 as hours", () => {
      expect(formatMetricValue(3.2, def)).toBe("3.2 hrs");
    });

    it("formats values < 1 as minutes", () => {
      expect(formatMetricValue(0.5, def)).toBe("30 min");
    });

    it("formats exactly 1 as hours", () => {
      expect(formatMetricValue(1, def)).toBe("1.0 hrs");
    });
  });

  describe("float with unit=PRs/wk (PR Throughput)", () => {
    const def = defWithType("float", { unit: "PRs/wk" });

    it("formats as rate per week", () => {
      expect(formatMetricValue(2.4, def)).toBe("2.4/wk");
    });

    it("formats low values", () => {
      expect(formatMetricValue(0.5, def)).toBe("0.5/wk");
    });
  });

  describe("int", () => {
    const def = defWithType("int");

    it("formats whole numbers", () => {
      expect(formatMetricValue(5, def)).toBe("5");
    });

    it("rounds to nearest integer", () => {
      expect(formatMetricValue(5.7, def)).toBe("6");
      expect(formatMetricValue(5.3, def)).toBe("5");
    });

    it("formats zero", () => {
      expect(formatMetricValue(0, def)).toBe("0");
    });
  });
});

// ---------------------------------------------------------------------------
// getMetricDef
// ---------------------------------------------------------------------------

describe("getMetricDef", () => {
  it("returns the correct def for a known slug", () => {
    const def = getMetricDef("ci-success-rate");
    expect(def).toBeDefined();
    expect(def!.label).toBe("CI Success Rate");
    expect(def!.valueType).toBe("ratio");
  });

  it("returns undefined for an unknown slug", () => {
    expect(getMetricDef("nonexistent")).toBeUndefined();
  });

  it("finds all 15 defined metrics", () => {
    expect(METRIC_DEFS).toHaveLength(15);
    const slugs = [
      "post-open-commits",
      "ci-success-rate",
      "line-revisit-rate",
      "cache-hit-rate",
      "iteration-depth",
      "token-cost-per-pr",
      "sidechain-rate",
      "re-read-rate",
      "autonomy-score",
      "task-cycle-time",
      "pr-throughput",
      "peak-context-pct",
      "skill-tool-usage",
      "subagent-delegation",
      "rubber-stamp-rate",
    ];
    for (const slug of slugs) {
      expect(getMetricDef(slug)).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// DISPLAYED_METRICS / CATEGORIES
// ---------------------------------------------------------------------------

describe("DISPLAYED_METRICS", () => {
  it("contains only metrics with displayed: true", () => {
    expect(DISPLAYED_METRICS.length).toBe(9);
    for (const m of DISPLAYED_METRICS) {
      expect(m.displayed).toBe(true);
    }
  });

  it("includes all 9 displayed metrics", () => {
    const slugs = DISPLAYED_METRICS.map((m) => m.slug);
    expect(slugs).toContain("task-cycle-time");
    expect(slugs).toContain("pr-throughput");
    expect(slugs).toContain("post-open-commits");
    expect(slugs).toContain("iteration-depth");
    expect(slugs).toContain("peak-context-pct");
    expect(slugs).toContain("autonomy-score");
    expect(slugs).toContain("skill-tool-usage");
    expect(slugs).toContain("subagent-delegation");
    expect(slugs).toContain("rubber-stamp-rate");
  });

  it("has 3 metrics per category", () => {
    for (const cat of CATEGORIES) {
      const count = DISPLAYED_METRICS.filter((m) => m.category === cat).length;
      expect(count).toBe(3);
    }
  });
});

describe("CATEGORIES", () => {
  it("lists the 3 new categories in order", () => {
    expect(CATEGORIES).toEqual([
      "Delivery",
      "Session Effectiveness",
      "Adoption Maturity",
    ]);
  });

  it("every metric belongs to a valid category", () => {
    for (const def of METRIC_DEFS) {
      expect(CATEGORIES).toContain(def.category);
    }
  });
});
