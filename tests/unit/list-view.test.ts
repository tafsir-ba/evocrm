import { describe, expect, it } from "vitest";

import {
  daysSince,
  formatLocation,
  formatRelativeAge,
  hasPositiveCount,
  visibleOverflowItems,
} from "@/lib/list-view";

const now = new Date("2026-08-30T12:00:00.000Z");

describe("list-view helpers", () => {
  it("formats compact relative ages used across CRM lists", () => {
    expect(formatRelativeAge("2026-08-30T11:59:30.000Z", now)).toBe("<1m");
    expect(formatRelativeAge("2026-08-30T10:00:00.000Z", now)).toBe("2h");
    expect(formatRelativeAge("2026-08-27T12:00:00.000Z", now)).toBe("3d");
    expect(formatRelativeAge(null, now)).toBe("—");
  });

  it("joins location parts and keeps Unicode names", () => {
    expect(formatLocation("Genève", "Suisse")).toBe("Genève, Suisse");
    expect(formatLocation(null, "Suisse")).toBe("Suisse");
    expect(formatLocation(undefined, null)).toBe("—");
  });

  it("keeps one overflow chip and reports the rest", () => {
    expect(visibleOverflowItems(["VIP", "Genève", "Chalet"], 1)).toEqual({
      visible: ["VIP"],
      overflow: 2,
    });
    expect(visibleOverflowItems(["VIP"], 1)).toEqual({ visible: ["VIP"], overflow: 0 });
  });

  it("treats only positive counts as meaningful inventory", () => {
    expect(hasPositiveCount(0)).toBe(false);
    expect(hasPositiveCount(null)).toBe(false);
    expect(hasPositiveCount(3)).toBe(true);
    expect(daysSince("2026-08-16T12:00:00.000Z", now)).toBe(14);
  });
});
