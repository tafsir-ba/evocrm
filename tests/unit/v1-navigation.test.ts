import { describe, expect, it } from "vitest";

import {
  FEATURE_NAV_ITEMS,
  FORBIDDEN_PRIMARY_NAV_LABELS,
  V1_NAV_ITEMS,
  navHrefForSegment,
} from "@/lib/v1-navigation";

describe("V1 navigation scope", () => {
  it("includes only locked V1 primary modules", () => {
    expect(V1_NAV_ITEMS.map((item) => item.label)).toEqual([
      "Dashboard",
      "Projects",
      "Pipeline",
      "Leads",
      "Properties",
      "Activities",
      "Notes",
      "Dripping",
      "Settings",
    ]);
  });

  it("keeps Paid ads as a feature-flagged entry outside the locked core list", () => {
    expect(V1_NAV_ITEMS.map((item) => item.label)).not.toContain("Paid ads");
    expect(FEATURE_NAV_ITEMS).toEqual([
      {
        segment: "advertising",
        label: "Paid ads",
        permission: "advertising:read",
      },
    ]);
  });

  it("routes Notes to the top-level /notes app", () => {
    expect(navHrefForSegment("demo-workspace", "notes")).toBe("/notes");
    expect(navHrefForSegment("demo-workspace", "dashboard")).toBe(
      "/w/demo-workspace/dashboard",
    );
  });

  it("does not include forbidden primary nav labels", () => {
    const labels = [
      ...V1_NAV_ITEMS.map((item) => item.label),
      ...FEATURE_NAV_ITEMS.map((item) => item.label),
    ];
    for (const forbidden of FORBIDDEN_PRIMARY_NAV_LABELS) {
      expect(labels).not.toContain(forbidden);
    }
  });

  it("guards against the full forbidden primary nav list", () => {
    expect(FORBIDDEN_PRIMARY_NAV_LABELS).toEqual([
      "Contacts",
      "Companies",
      "Reports",
      "Tasks",
      "Documents",
      "Integrations",
      "Client Portal",
      "Opportunities",
      "Calendar",
      "Automations",
      "Marketing",
      "Billing",
      "Users",
      "Roles",
    ]);
  });
});
