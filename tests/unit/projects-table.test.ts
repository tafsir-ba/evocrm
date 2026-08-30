import { describe, expect, it } from "vitest";

import {
  anyProjectHasActivity,
  anyProjectHasInventory,
  formatProjectActivity,
  formatProjectInventory,
  formatProjectInventoryLine,
  formatProjectLocation,
  projectListStatus,
} from "@/lib/projects-table";

const now = new Date(2026, 7, 30, 12, 0, 0);

describe("projects table presentation", () => {
  it("joins location parts and keeps Unicode city names", () => {
    expect(formatProjectLocation("Genève", "Suisse")).toBe("Genève, Suisse");
    expect(formatProjectLocation(null, "Suisse")).toBe("Suisse");
    expect(formatProjectLocation(null, null)).toBe("—");
  });

  it("omits zero inventory counts so empty columns can stay hidden", () => {
    expect(
      formatProjectInventory({
        properties: 0,
        opportunities: 2,
        activeCampaigns: 0,
      }),
    ).toEqual([{ key: "pipeline", label: "Pipeline", value: 2 }]);
    expect(
      formatProjectInventoryLine({
        properties: 4,
        opportunities: 0,
        activeCampaigns: 1,
      }),
    ).toBe("4 properties · 1 dripping");
    expect(
      anyProjectHasInventory([
        { counts: { properties: 0, opportunities: 0, activeCampaigns: 0 } },
      ]),
    ).toBe(false);
    expect(
      anyProjectHasInventory([
        { counts: { properties: 0, opportunities: 0, activeCampaigns: 3 } },
      ]),
    ).toBe(true);
  });

  it("marks archived, stale, and active projects from real activity dates", () => {
    expect(
      projectListStatus({
        archivedAt: "2026-08-01T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
        now,
      }).label,
    ).toBe("Archived");

    expect(
      projectListStatus({
        createdAt: new Date(2026, 6, 1),
        lastActivityAt: new Date(2026, 7, 1),
        now,
      }).label,
    ).toBe("Stale");

    expect(
      projectListStatus({
        createdAt: now,
        lastActivityAt: now,
        now,
      }).label,
    ).toBe("Active");
  });

  it("formats recent activity and hides the column when none exists", () => {
    expect(formatProjectActivity(new Date(2026, 7, 29, 12, 0, 0), now)).toBe("1d");
    expect(formatProjectActivity(null, now)).toBe("—");
    expect(anyProjectHasActivity([{ counts: { lastActivityAt: null } }])).toBe(false);
    expect(
      anyProjectHasActivity([{ counts: { lastActivityAt: "2026-08-29T12:00:00.000Z" } }]),
    ).toBe(true);
  });
});
