import { describe, expect, it } from "vitest";

import {
  FORBIDDEN_PRIMARY_NAV_LABELS,
  V1_NAV_ITEMS,
  buildPermissionAwareNavigation,
  getRequiredPermissionForSegment,
  isPrimaryNavItemActive,
  navHrefForSegment,
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

  it("links Notes to /notes when activity:read is granted", () => {
    const navigation = buildPermissionAwareNavigation("demo", ["activity:read"]);
    const notes = navigation.find((item) => item.segment === "notes");
    expect(notes).toEqual({
      label: "Notes",
      href: "/notes",
      permission: "activity:read",
      segment: "notes",
    });
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
      "project:read",
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

  it("hides Paid ads when advertising feature flag is off", () => {
    const navigation = buildPermissionAwareNavigation(
      "demo",
      ["settings:read", "advertising:read"],
      { advertisingEnabled: false },
    );

    expect(navigation.map((item) => item.label)).toEqual(["Settings"]);
    expect(
      navigation.find((item) => item.segment === "advertising"),
    ).toBeUndefined();
  });

  it("hides Paid ads when user lacks advertising:read", () => {
    const navigation = buildPermissionAwareNavigation(
      "demo",
      ["settings:read"],
      { advertisingEnabled: true },
    );

    expect(navigation.map((item) => item.label)).toEqual(["Settings"]);
  });

  it("shows Paid ads before Settings when flag on and advertising:read granted", () => {
    const navigation = buildPermissionAwareNavigation(
      "demo",
      ["settings:read", "advertising:read", "dashboard:read"],
      { advertisingEnabled: true },
    );

    expect(navigation.map((item) => item.label)).toEqual([
      "Dashboard",
      "Paid ads",
      "Settings",
    ]);
    expect(navigation.find((item) => item.segment === "advertising")).toEqual({
      label: "Paid ads",
      href: "/w/demo/settings/advertising",
      permission: "advertising:read",
      segment: "advertising",
    });
  });

  it("links Paid ads to the existing Settings hub", () => {
    expect(navHrefForSegment("demo", "advertising")).toBe(
      "/w/demo/settings/advertising",
    );
  });

  it("maps advertising segment to advertising:read", () => {
    expect(getRequiredPermissionForSegment("advertising")).toBe(
      "advertising:read",
    );
  });

  it("activates Paid ads over Settings on the hub path", () => {
    const navigation = buildPermissionAwareNavigation(
      "demo",
      ["settings:read", "advertising:read"],
      { advertisingEnabled: true },
    );
    const paidAds = navigation.find((item) => item.segment === "advertising")!;
    const settings = navigation.find((item) => item.segment === "settings")!;
    const hub = "/w/demo/settings/advertising";

    expect(isPrimaryNavItemActive(hub, paidAds, navigation)).toBe(true);
    expect(isPrimaryNavItemActive(hub, settings, navigation)).toBe(false);
    expect(
      isPrimaryNavItemActive("/w/demo/settings/users", settings, navigation),
    ).toBe(true);
  });
});
