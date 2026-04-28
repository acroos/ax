import { describe, it, expect } from "vitest";
import { ALL_AGENTS, AGENT_LABELS, AGENT_COLORS } from "@/lib/agents.gen";

// AgentBadge renders AGENT_LABELS[id] as the visible text and applies
// AGENT_COLORS[id] as an inline backgroundColor on the accent dot.
// These tests verify the contracts the component depends on.

describe("AgentBadge (contract tests)", () => {
  it("every agent has a non-empty label for display", () => {
    for (const id of ALL_AGENTS) {
      expect(AGENT_LABELS[id]).toBeTruthy();
      expect(typeof AGENT_LABELS[id]).toBe("string");
    }
  });

  it("every agent has a hex color string for the dot", () => {
    for (const id of ALL_AGENTS) {
      const color = AGENT_COLORS[id];
      expect(color).toBeTruthy();
      // Must be a valid hex color
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("claude_code renders 'Claude Code' label", () => {
    expect(AGENT_LABELS["claude_code"]).toBe("Claude Code");
  });

  it("copilot_cli renders 'Copilot CLI' label", () => {
    expect(AGENT_LABELS["copilot_cli"]).toBe("Copilot CLI");
  });

  it("claude_code dot color is the expected orange", () => {
    expect(AGENT_COLORS["claude_code"]).toBe("#c4621a");
  });

  it("copilot_cli dot color is the expected blue", () => {
    expect(AGENT_COLORS["copilot_cli"]).toBe("#5a8fd8");
  });
});
