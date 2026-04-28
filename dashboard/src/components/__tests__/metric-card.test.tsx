import { describe, it, expect } from "vitest";

// Test the display value logic for MetricCard:
// displayValue = unsupported ? "N/A" : value
// title       = unsupported && unsupportedLabel ? `Not available for ${unsupportedLabel} sessions` : undefined

function displayValue(value: string, unsupported?: boolean): string {
  return unsupported ? "N/A" : value;
}

function titleAttr(unsupported?: boolean, unsupportedLabel?: string): string | undefined {
  return unsupported && unsupportedLabel
    ? `Not available for ${unsupportedLabel} sessions`
    : undefined;
}

describe("MetricCard display logic", () => {
  it("unsupported=false + em-dash value renders em-dash (no data, supported metric)", () => {
    expect(displayValue("\u2014", false)).toBe("\u2014");
  });

  it("unsupported=false + real value renders value (normal metric)", () => {
    expect(displayValue("42%", false)).toBe("42%");
  });

  it("unsupported=true + em-dash renders N/A (capability mismatch)", () => {
    expect(displayValue("\u2014", true)).toBe("N/A");
  });

  it("unsupported=true + real value renders N/A (defensive: stale value wins over leaking data)", () => {
    expect(displayValue("42%", true)).toBe("N/A");
  });

  it("N/A tooltip includes agent label when unsupported and label provided", () => {
    expect(titleAttr(true, "Cursor")).toBe("Not available for Cursor sessions");
  });

  it("no tooltip when unsupported=false", () => {
    expect(titleAttr(false, "Cursor")).toBeUndefined();
  });

  it("no tooltip when unsupported=true but no label", () => {
    expect(titleAttr(true, undefined)).toBeUndefined();
  });
});
