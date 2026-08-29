import { describe, expect, it } from "vitest";

import {
  createIntegrationInputSchema,
  updateIntegrationInputSchema,
} from "@/server/validation/integrations";
import { websiteLeadCaptureInputSchema as websiteSchema } from "@/server/validation/website-lead-capture";

describe("integrations validation", () => {
  it("accepts allowed integration types only", () => {
    const valid = createIntegrationInputSchema.safeParse({
      type: "website",
      name: "Website Lead Capture",
    });
    const invalid = createIntegrationInputSchema.safeParse({
      type: "zapier",
      name: "Bad",
    });

    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
  });

  it("rejects unknown integration fields", () => {
    const result = createIntegrationInputSchema.safeParse({
      type: "website",
      name: "Website",
      workspaceId: "abc",
    });

    expect(result.success).toBe(false);
  });

  it("requires HubSpot access token and portal on create; client secret optional", () => {
    const missing = createIntegrationInputSchema.safeParse({
      type: "hubspot",
      name: "HubSpot CRM",
    });
    const tokenOnly = createIntegrationInputSchema.safeParse({
      type: "hubspot",
      name: "HubSpot CRM",
      hubspotAccessToken: "pat-xxxxxxxxxxxx",
      hubspotPortalId: "12345",
    });
    const valid = createIntegrationInputSchema.safeParse({
      type: "hubspot",
      name: "HubSpot CRM",
      hubspotAccessToken: "pat-xxxxxxxxxxxx",
      hubspotClientSecret: "client-secret",
      hubspotPortalId: "12345",
    });

    expect(missing.success).toBe(false);
    expect(tokenOnly.success).toBe(true);
    expect(valid.success).toBe(true);
  });

  it("rejects HubSpot credential fields on non-HubSpot creates", () => {
    const result = createIntegrationInputSchema.safeParse({
      type: "website",
      name: "Website",
      hubspotAccessToken: "pat-xxxxxxxxxxxx",
    });

    expect(result.success).toBe(false);
  });

  it("allows safe integration updates", () => {
    const result = updateIntegrationInputSchema.safeParse({ status: "paused" });
    expect(result.success).toBe(true);
  });

  it("rejects archiving via PATCH", () => {
    const result = updateIntegrationInputSchema.safeParse({ status: "archived" });
    expect(result.success).toBe(false);
  });
});

describe("website lead capture validation", () => {
  it("requires firstName, lastName, and email or phone", () => {
    const valid = websiteSchema.safeParse({
      firstName: "John",
      lastName: "Smith",
      email: "john@example.com",
    });
    const missingContact = websiteSchema.safeParse({
      firstName: "John",
      lastName: "Smith",
    });

    expect(valid.success).toBe(true);
    expect(missingContact.success).toBe(false);
  });

  it("rejects trusted workspaceId in payload", () => {
    const result = websiteSchema.safeParse({
      firstName: "John",
      lastName: "Smith",
      email: "john@example.com",
      workspaceId: "000000000000000000000000",
    });

    expect(result.success).toBe(false);
  });

  it("validates budget range", () => {
    const invalid = websiteSchema.safeParse({
      firstName: "John",
      lastName: "Smith",
      email: "john@example.com",
      budgetMin: 1000,
      budgetMax: 500,
    });

    expect(invalid.success).toBe(false);
  });
});
