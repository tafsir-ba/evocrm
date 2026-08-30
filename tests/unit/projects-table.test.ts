import { describe, expect, it } from "vitest";

import {
  anyProjectHasInbound,
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
    ).toBe("4 properties · 1 workflow");
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

  it("marks archived, stale, active, and unknown from genuine inbound dates only", () => {
    expect(
      projectListStatus({
        archivedAt: "2026-08-01T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
        now,
      }).label,
    ).toBe("Archived");

    expect(
      projectListStatus({
        createdAt: now,
        lastActivityAt: now,
        lastGenuineInboundAt: new Date(2026, 6, 1),
        now,
      }).label,
    ).toBe("Stale");

    expect(
      projectListStatus({
        createdAt: new Date(2025, 0, 1),
        lastActivityAt: new Date(2025, 0, 1),
        lastGenuineInboundAt: now,
        now,
      }).label,
    ).toBe("Active");

    expect(
      projectListStatus({
        createdAt: now,
        lastActivityAt: now,
        lastGenuineInboundAt: null,
        now,
      }).label,
    ).toBe("Unknown");
  });

  it("formats last inbound with basis and ignores CRM activity timestamps", () => {
    expect(formatProjectActivity(new Date(2026, 7, 29, 12, 0, 0), "received_at", now)).toBe(
      "1d · received",
    );
    expect(formatProjectActivity(null, null, now)).toBe("Needs inbound date");
    expect(anyProjectHasInbound([{ counts: { lastGenuineInboundAt: null } }])).toBe(false);
    expect(
      anyProjectHasInbound([{ counts: { lastGenuineInboundAt: "2026-08-29T12:00:00.000Z" } }]),
    ).toBe(true);
    expect(anyProjectHasInbound([{ counts: { lastActivityAt: now.toISOString() } }])).toBe(
      false,
    );
  });
});
