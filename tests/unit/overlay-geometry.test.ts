import { describe, expect, it } from "vitest";

import { boxesOverlap } from "@/lib/overlay-geometry";

describe("overlay geometry", () => {
  it("detects overlapping boxes", () => {
    expect(
      boxesOverlap(
        { x: 100, y: 100, width: 80, height: 40 },
        { x: 160, y: 120, width: 80, height: 40 },
      ),
    ).toBe(true);
  });

  it("treats adjacent reserved dock space as non-overlapping", () => {
    expect(
      boxesOverlap(
        { x: 0, y: 0, width: 800, height: 560 },
        { x: 640, y: 560, width: 160, height: 52 },
      ),
    ).toBe(false);
  });

  it("flags a floating control that covers pagination", () => {
    expect(
      boxesOverlap(
        { x: 700, y: 820, width: 88, height: 36 },
        { x: 720, y: 830, width: 72, height: 32 },
      ),
    ).toBe(true);
  });
});
