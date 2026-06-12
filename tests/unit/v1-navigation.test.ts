import { describe, expect, it } from "vitest";

import {
  FORBIDDEN_PRIMARY_NAV_LABELS,
  V1_NAV_ITEMS,
} from "@/lib/v1-navigation";

describe("V1 navigation scope", () => {
  it("includes only locked V1 primary modules", () => {
    expect(V1_NAV_ITEMS.map((item) => item.label)).toEqual([
      "Dashboard",
      "Pipeline",
      "Leads",
      "Properties",
      "Activities",
      "Dripping",
      "Settings",
    ]);
  });

  it("does not include forbidden primary nav labels", () => {
    const labels = V1_NAV_ITEMS.map((item) => item.label);
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
      "Projects",
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
