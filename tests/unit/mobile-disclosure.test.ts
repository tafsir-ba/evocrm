import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("mobile disclosure desktop override", () => {
  it("forces closed details content visible from the md breakpoint", () => {
    const css = readFileSync("app/globals.css", "utf8");
    const desktop = css.slice(css.indexOf("@media (min-width: 768px)"));
    expect(desktop).toContain(".mobile-disclosure::details-content");
    expect(desktop).toContain("content-visibility: visible !important");
    expect(desktop).toContain(".mobile-disclosure > summary");
    expect(desktop).toContain("display: none");
  });
});
