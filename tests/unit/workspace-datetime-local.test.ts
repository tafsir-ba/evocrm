import { describe, expect, it } from "vitest";

import {
  fromDatetimeLocalInWorkspaceTimezone,
  toDatetimeLocalInWorkspaceTimezone,
} from "@/lib/workspace-datetime";

describe("workspace datetime local conversion", () => {
  it("round-trips Zurich local wall time", () => {
    const iso = fromDatetimeLocalInWorkspaceTimezone("2026-07-30T10:00", "Europe/Zurich");
    expect(iso).toBeTruthy();
    expect(toDatetimeLocalInWorkspaceTimezone(iso, "Europe/Zurich")).toBe("2026-07-30T10:00");
  });

  it("accepts datetime-local values that include seconds", () => {
    const iso = fromDatetimeLocalInWorkspaceTimezone(
      "2026-07-30T10:00:00",
      "Europe/Zurich",
    );
    expect(iso).toBeTruthy();
    expect(toDatetimeLocalInWorkspaceTimezone(iso, "Europe/Zurich")).toBe("2026-07-30T10:00");
  });

  it("returns undefined for empty input", () => {
    expect(fromDatetimeLocalInWorkspaceTimezone("", "Europe/Zurich")).toBeUndefined();
    expect(fromDatetimeLocalInWorkspaceTimezone("   ", "UTC")).toBeUndefined();
  });
});
