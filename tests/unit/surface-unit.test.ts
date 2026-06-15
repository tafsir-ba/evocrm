import { describe, expect, it } from "vitest";

import {
  formatSurfaceValue,
  parseSurfaceInput,
  sqmToInputValue,
} from "@/lib/surface-unit";

describe("surface-unit", () => {
  it("parses sqm input as canonical sqm", () => {
    expect(parseSurfaceInput("100", "sqm")).toBe(100);
  });

  it("parses sqft input into canonical sqm", () => {
    const sqm = parseSurfaceInput("1076.39", "sqft");
    expect(sqm).toBeCloseTo(100, 0);
  });

  it("formats surface for display", () => {
    expect(formatSurfaceValue(96, "sqm")).toContain("m²");
    expect(formatSurfaceValue(1, "sqft")).toContain("sq ft");
  });

  it("converts stored sqm to input value", () => {
    expect(sqmToInputValue(96, "sqm")).toBe("96");
    expect(sqmToInputValue(1, "sqft")).toBeTruthy();
  });
});
