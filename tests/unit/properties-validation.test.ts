import { describe, expect, it } from "vitest";

import {
  createPropertyInputSchema,
  propertyListQuerySchema,
  updatePropertyInputSchema,
} from "@/server/validation/properties";

describe("property validation", () => {
  it("requires title and statusId on create", () => {
    const result = createPropertyInputSchema.safeParse({
      title: "Green View Apartment 12",
      statusId: "507f1f77bcf86cd799439011",
    });

    expect(result.success).toBe(true);
  });

  it("rejects unknown fields on create", () => {
    const result = createPropertyInputSchema.safeParse({
      title: "Green View Apartment 12",
      statusId: "507f1f77bcf86cd799439011",
      workspaceId: "507f1f77bcf86cd799439012",
      createdBy: "507f1f77bcf86cd799439013",
    });

    expect(result.success).toBe(false);
  });

  it("validates maxPrice is greater than or equal to minPrice in list query", () => {
    const result = propertyListQuerySchema.safeParse({
      minPrice: 1000000,
      maxPrice: 500000,
    });

    expect(result.success).toBe(false);
  });

  it("parses list query pagination defaults", () => {
    const result = propertyListQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(25);
    }
  });

  it("requires at least one field on update", () => {
    const result = updatePropertyInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("validates currency as 3-letter ISO code", () => {
    const result = createPropertyInputSchema.safeParse({
      title: "Test Property",
      statusId: "507f1f77bcf86cd799439011",
      currency: "CHF",
    });

    expect(result.success).toBe(true);
  });
});
