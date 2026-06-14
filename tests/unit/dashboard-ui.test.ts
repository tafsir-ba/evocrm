import { describe, expect, it } from "vitest";

import { FORBIDDEN_PRIMARY_NAV_LABELS, V1_NAV_ITEMS } from "@/lib/v1-navigation";

describe("dashboard UI scope", () => {
  it("keeps Reports and Analytics out of primary navigation", () => {
    const labels = V1_NAV_ITEMS.map((item) => item.label);
    expect(labels).toContain("Dashboard");
    expect(labels).not.toContain("Reports");
    expect(labels).not.toContain("Analytics");
    expect(FORBIDDEN_PRIMARY_NAV_LABELS).toContain("Reports");
  });
});
