import { describe, expect, it } from "vitest";

import {
  createLeadApiInputSchema,
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

  it("accepts createdAt on import create input", () => {
    const result = createLeadInputSchema.safeParse({
      projectId: "507f1f77bcf86cd799439012",
      firstName: "John",
      lastName: "Smith",
      statusId: "507f1f77bcf86cd799439011",
      createdAt: "2026-06-16 01:59",
    });

    expect(result.success).toBe(true);
  });

  it("rejects createdAt on public API create input", () => {
    const result = createLeadApiInputSchema.safeParse({
      projectId: "507f1f77bcf86cd799439012",
      firstName: "John",
      lastName: "Smith",
      statusId: "507f1f77bcf86cd799439011",
      createdAt: "2026-06-16 01:59",
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

  it("accepts an optional company association without requiring person free text", () => {
    const create = createLeadApiInputSchema.safeParse({
      projectId: "507f1f77bcf86cd799439012",
      firstName: "John",
      lastName: "Smith",
      statusId: "507f1f77bcf86cd799439011",
      companyId: "507f1f77bcf86cd7994390aa",
    });
    expect(create.success).toBe(true);

    const update = updateLeadInputSchema.safeParse({ companyId: "507f1f77bcf86cd7994390aa" });
    expect(update.success).toBe(true);

    const list = leadListQuerySchema.safeParse({ companyId: "507f1f77bcf86cd7994390aa" });
    expect(list.success).toBe(true);
  });

  it("accepts optional lead intelligence fields on create, update, and list", () => {
    const create = createLeadApiInputSchema.safeParse({
      projectId: "507f1f77bcf86cd799439012",
      firstName: "John",
      lastName: "Smith",
      statusId: "507f1f77bcf86cd799439011",
      industry: "Finance",
      jobTitle: "Analyst",
      stateRegion: "Geneva",
    });
    expect(create.success).toBe(true);

    const update = updateLeadInputSchema.safeParse({
      industry: "Hospitality",
      jobTitle: null,
      stateRegion: "Vaud",
    });
    expect(update.success).toBe(true);

    const list = leadListQuerySchema.safeParse({
      industry: "Finance",
      jobTitle: "Analyst",
      stateRegion: "Geneva",
      acquisition: "genuine_inbound",
    });
    expect(list.success).toBe(true);
  });

  it("accepts genuine vs imported acquisition filters on list", () => {
    expect(leadListQuerySchema.safeParse({ acquisition: "genuine_inbound" }).success).toBe(true);
    expect(leadListQuerySchema.safeParse({ acquisition: "legacy_import" }).success).toBe(true);
    expect(leadListQuerySchema.safeParse({ acquisition: "all" }).success).toBe(false);
  });
});
