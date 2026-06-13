import { describe, expect, it } from "vitest";

import {
  formatDateTimeInWorkspaceTimezone,
  fromDatetimeLocalInWorkspaceTimezone,
  toDatetimeLocalInWorkspaceTimezone,
} from "@/lib/workspace-datetime";

describe("workspace datetime helpers", () => {
  it("formats instants in the workspace timezone", () => {
    const formatted = formatDateTimeInWorkspaceTimezone(
      "2026-07-15T10:00:00.000Z",
      "Europe/Zurich",
    );

    expect(formatted).toContain("2026");
    expect(formatted).toMatch(/12:00|11:00/);
  });

  it("round-trips datetime-local values in workspace timezone", () => {
    const iso = fromDatetimeLocalInWorkspaceTimezone("2026-07-15T10:00", "Europe/Zurich");
    expect(iso).toBeTruthy();

    const local = toDatetimeLocalInWorkspaceTimezone(iso, "Europe/Zurich");
    expect(local).toBe("2026-07-15T10:00");
  });

  it("falls back safely for invalid timezone", () => {
    const formatted = formatDateTimeInWorkspaceTimezone(
      "2026-07-15T10:00:00.000Z",
      "Invalid/Zone",
    );

    expect(formatted).not.toBe("—");
  });
});
