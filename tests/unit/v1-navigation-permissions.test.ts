import { describe, expect, it } from "vitest";

import {
  FORBIDDEN_PRIMARY_NAV_LABELS,
  V1_NAV_ITEMS,
  buildPermissionAwareNavigation,
  getRequiredPermissionForSegment,
} from "@/lib/v1-navigation";

describe("permission-aware navigation", () => {
  it("maps only V1 modules to permission keys", () => {
    const navigation = buildPermissionAwareNavigation("demo", [
      "dashboard:read",
      "lead:read",
      "settings:read",
    ]);

    expect(navigation.map((item) => item.label)).toEqual([
      "Dashboard",
      "Leads",
      "Settings",
    ]);
    expect(navigation.every((item) => item.href.startsWith("/w/demo/"))).toBe(
      true,
    );
  });

  it("hides modules without permission", () => {
    const navigation = buildPermissionAwareNavigation("demo", ["dashboard:read"]);

    expect(navigation).toHaveLength(1);
    expect(navigation[0].label).toBe("Dashboard");
  });

  it("maps opportunity detail routes to opportunity:read", () => {
    expect(getRequiredPermissionForSegment("opportunities")).toBe(
      "opportunity:read",
    );
  });

  it("returns undefined for unmapped segments", () => {
    expect(getRequiredPermissionForSegment("states")).toBeUndefined();
  });

  it("never includes forbidden primary nav labels", () => {
    const navigation = buildPermissionAwareNavigation("demo", [
      "dashboard:read",
      "lead:read",
      "property:read",
      "opportunity:read",
      "activity:read",
      "campaign:read",
      "settings:read",
    ]);

    const labels = navigation.map((item) => item.label);

    for (const forbidden of FORBIDDEN_PRIMARY_NAV_LABELS) {
      expect(labels).not.toContain(forbidden);
    }

    expect(labels).toEqual(V1_NAV_ITEMS.map((item) => item.label));
  });
});
