import { describe, it, expect } from "vitest";
import { METRIC_DEFS, type MetricDefEntry } from "@/lib/metric-defs";
import { agentSupportsMetric, type AgentType } from "@/lib/agents.gen";

// Mirrors the unsupported-detection logic in OverviewMetricsGrid. PR-derived
// metrics are agent-agnostic — the agent capability matrix only governs
// session-derived metrics — so they should never render as N/A under any
// agent filter.
function isUnsupported(def: MetricDefEntry, currentAgent: AgentType | undefined): boolean {
  return (
    currentAgent !== undefined &&
    def.source === "session" &&
    !agentSupportsMetric(currentAgent, def.slug)
  );
}

describe("OverviewMetricsGrid unsupported detection", () => {
  const def = (slug: string) => METRIC_DEFS.find((d) => d.slug === slug)!;

  it("PR-only metric is supported under every agent filter", () => {
    expect(isUnsupported(def("post-open-commits"), "claude_code")).toBe(false);
    expect(isUnsupported(def("post-open-commits"), "copilot_cli")).toBe(false);
    expect(isUnsupported(def("post-open-commits"), "cursor_cli")).toBe(false);
  });

  it("PR-derived rubber-stamp-rate is supported under every agent filter", () => {
    expect(isUnsupported(def("rubber-stamp-rate"), "cursor_cli")).toBe(false);
  });

  it("session metric unsupported by Cursor renders as unsupported under Cursor filter", () => {
    expect(isUnsupported(def("cache-hit-rate"), "cursor_cli")).toBe(true);
  });

  it("session metric supported by Cursor renders normally under Cursor filter", () => {
    expect(isUnsupported(def("iteration-depth"), "cursor_cli")).toBe(false);
  });

  it("no agent filter never marks anything unsupported", () => {
    for (const d of METRIC_DEFS) {
      expect(isUnsupported(d, undefined)).toBe(false);
    }
  });
});
