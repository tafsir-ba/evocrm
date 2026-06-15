import { describe, expect, it } from "vitest";

import {
  createLeadInputSchema,
  leadListQuerySchema,
  updateLeadInputSchema,
} from "@/server/validation/leads";

describe("lead validation", () => {
  it("requires firstName, lastName, projectId, and statusId on create", () => {
    const result = createLeadInputSchema.safeParse({
      projectId: "507f1f77bcf86cd799439012",
      firstName: "John",
      lastName: "Smith",
      statusId: "507f1f77bcf86cd799439011",
    });

    expect(result.success).toBe(true);
  });

  it("rejects unknown fields on create", () => {
    const result = createLeadInputSchema.safeParse({
      firstName: "John",
      lastName: "Smith",
      statusId: "507f1f77bcf86cd799439011",
      workspaceId: "507f1f77bcf86cd799439012",
    });

    expect(result.success).toBe(false);
  });

  it("validates budgetMax is greater than or equal to budgetMin", () => {
    const result = createLeadInputSchema.safeParse({
      firstName: "John",
      lastName: "Smith",
      statusId: "507f1f77bcf86cd799439011",
      budgetMin: 1000000,
      budgetMax: 500000,
    });

    expect(result.success).toBe(false);
  });

  it("parses list query pagination defaults", () => {
    const result = leadListQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(25);
    }
  });

  it("requires at least one field on update", () => {
    const result = updateLeadInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
