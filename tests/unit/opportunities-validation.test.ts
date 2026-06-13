import { describe, expect, it } from "vitest";

import {
  createOpportunityInputSchema,
  opportunityListQuerySchema,
  stageOpportunityInputSchema,
  updateOpportunityInputSchema,
} from "@/server/validation/opportunities";

const objectId = "507f1f77bcf86cd799439011";

describe("opportunity validation", () => {
  it("accepts valid create input", () => {
    const result = createOpportunityInputSchema.safeParse({
      leadId: objectId,
      propertyId: "507f1f77bcf86cd799439012",
      statusId: "507f1f77bcf86cd799439013",
      value: 875000,
      currency: "CHF",
      notes: "Interested in lake-view apartment.",
      tags: [objectId],
    });

    expect(result.success).toBe(true);
  });

  it("rejects create input with unknown fields", () => {
    const result = createOpportunityInputSchema.safeParse({
      leadId: objectId,
      propertyId: "507f1f77bcf86cd799439012",
      statusId: "507f1f77bcf86cd799439013",
      workspaceId: objectId,
      createdBy: objectId,
    });

    expect(result.success).toBe(false);
  });

  it("requires at least one field on update", () => {
    const result = updateOpportunityInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("accepts stage move input", () => {
    const result = stageOpportunityInputSchema.safeParse({
      statusId: objectId,
      lostReasonId: "507f1f77bcf86cd799439014",
      lostReasonText: "Client bought elsewhere.",
    });

    expect(result.success).toBe(true);
  });

  it("parses behavior filter on list query", () => {
    const result = opportunityListQuerySchema.safeParse({
      behavior: "terminal_lost",
      includeArchived: "true",
      page: "2",
      pageSize: "50",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.behavior).toBe("terminal_lost");
      expect(result.data.includeArchived).toBe(true);
      expect(result.data.page).toBe(2);
      expect(result.data.pageSize).toBe(50);
    }
  });
});
