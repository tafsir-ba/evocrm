import { describe, expect, it } from "vitest";

import { propertyFormValuesFromSqm } from "@/lib/property-form-values";

describe("propertyFormValuesFromSqm", () => {
  it("maps null optional fields to empty form strings", () => {
    const values = propertyFormValuesFromSqm(
      {
        title: "Loft",
        reference: null,
        projectId: null,
        statusId: "status-1",
        typeId: null,
        price: null,
        currency: "CHF",
        address: null,
        city: null,
        country: null,
        rooms: null,
        bedrooms: null,
        bathrooms: null,
        surface: null,
        totalSurface: null,
        balconyTerraceSurface: null,
        floor: null,
        building: null,
        lot: null,
        description: null,
        features: [],
        tags: [],
        assignedUser: null,
      },
      "EUR",
    );

    expect(values.title).toBe("Loft");
    expect(values.statusId).toBe("status-1");
    expect(values.currency).toBe("CHF");
    expect(values.surface).toBe("");
    expect(values.features).toBe("");
    expect(values.assignedTo).toBe("");
  });
});
