import { describe, expect, it } from "vitest";

import { FORBIDDEN_PRIMARY_NAV_LABELS, V1_NAV_ITEMS } from "@/lib/v1-navigation";

describe("campaign UI scope", () => {
  it("keeps Dripping in primary navigation", () => {
    const labels = V1_NAV_ITEMS.map((item) => item.label);
    expect(labels).toContain("Dripping");
  });

  it("does not add Automations or Marketing as primary nav", () => {
    const labels = V1_NAV_ITEMS.map((item) => item.label);
    expect(labels).not.toContain("Automations");
    expect(labels).not.toContain("Marketing");
    expect(FORBIDDEN_PRIMARY_NAV_LABELS).toContain("Automations");
    expect(FORBIDDEN_PRIMARY_NAV_LABELS).toContain("Marketing");
  });
});
