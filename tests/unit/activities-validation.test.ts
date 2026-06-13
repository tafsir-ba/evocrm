import { describe, expect, it } from "vitest";

import {
  createActivityInputSchema,
  updateActivityInputSchema,
  activityListQuerySchema,
} from "@/server/validation/activities";

describe("activities validation", () => {
  const validId = "507f1f77bcf86cd799439011";

  it("requires at least one linked entity on create", () => {
    const result = createActivityInputSchema.safeParse({
      typeId: validId,
      statusId: validId,
      title: "Call lead",
    });

    expect(result.success).toBe(false);
  });

  it("accepts lead-only create input", () => {
    const result = createActivityInputSchema.safeParse({
      leadId: validId,
      typeId: validId,
      statusId: validId,
      title: "Call lead",
    });

    expect(result.success).toBe(true);
  });

  it("rejects unknown fields on create", () => {
    const result = createActivityInputSchema.safeParse({
      leadId: validId,
      typeId: validId,
      statusId: validId,
      title: "Call lead",
      workspaceId: validId,
      createdBy: validId,
    });

    expect(result.success).toBe(false);
  });

  it("requires at least one field on update", () => {
    const result = updateActivityInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("parses view filter allowlist", () => {
    const overdue = activityListQuerySchema.safeParse({ view: "overdue" });
    const invalid = activityListQuerySchema.safeParse({ view: "done" });

    expect(overdue.success).toBe(true);
    expect(invalid.success).toBe(false);
  });
});
