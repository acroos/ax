import { describe, it, expect } from "vitest";
import {
  formatMetricValue,
  getMetricDef,
  METRIC_DEFS,
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
    category: "Output Quality",
    valueType,
    lowerIsBetter: true,
    tooltip: "test",
    source: "pr" as const,
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

  it("finds all 9 defined metrics", () => {
    expect(METRIC_DEFS).toHaveLength(9);
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
    ];
    for (const slug of slugs) {
      expect(getMetricDef(slug)).toBeDefined();
    }
  });
});
