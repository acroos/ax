import { describe, it, expect } from "vitest";
import { ALL_AGENTS, AGENT_LABELS } from "../agents.gen";

describe("agents.gen", () => {
  it("ALL_AGENTS matches Object.keys(AGENT_LABELS)", () => {
    expect([...ALL_AGENTS].sort()).toEqual(Object.keys(AGENT_LABELS).sort());
  });

  it("ALL_AGENTS is non-empty", () => {
    expect(ALL_AGENTS.length).toBeGreaterThan(0);
  });

  it("every agent has a non-empty label", () => {
    for (const id of ALL_AGENTS) {
      expect(AGENT_LABELS[id]).toBeTruthy();
    }
  });
});
