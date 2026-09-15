import { describe, expect, it } from "vitest";

import { foldProjectLabel } from "@/lib/project-label";
import {
  normalizeWebsiteLeadCaptureBody,
  websiteLeadCaptureInputSchema as websiteSchema,
} from "@/server/validation/website-lead-capture";

describe("foldProjectLabel", () => {
  it("matches accent and case variants of the same project", () => {
    expect(foldProjectLabel("Éveil")).toBe(foldProjectLabel("Eveil"));
    expect(foldProjectLabel("EVEIL")).toBe(foldProjectLabel("eveil"));
    expect(foldProjectLabel(" Green-View ")).toBe("greenview");
  });
});

describe("website lead capture compatibility", () => {
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

  it("accepts snake_case, flat UTM, project, and extra marketing fields", () => {
    const result = websiteSchema.safeParse({
      first_name: "Anne",
      last_name: "Martin",
      email: "anne@example.com",
      phone: "+41791234567",
      project: "Eveil",
      lead_type: "general_contact",
      source_unit: "52_1",
      source_page: "/localisation.html",
      source_url: "https://example.test/localisation.html",
      interested_typologies: ["3.5", "4.5"],
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "launch",
      consent: true,
      workspaceId: "000000000000000000000000",
      createdBy: "spoofed",
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.data.firstName).toBe("Anne");
    expect(result.data.lastName).toBe("Martin");
    expect(result.data.projectReference).toBe("Eveil");
    expect(result.data.propertyReference).toBe("52_1");
    expect(result.data.preferredAreas).toEqual(["3.5", "4.5"]);
    expect(result.data.emailConsentStatus).toBe("subscribed");
    expect(result.data.utm).toEqual({
      source: "google",
      medium: "cpc",
      campaign: "launch",
    });
    expect(result.data.message).toContain("Lead type: general_contact");
    expect(result.data.message).toContain("Page: /localisation.html");
    expect(result.data).not.toHaveProperty("workspaceId");
    expect(result.data).not.toHaveProperty("lead_type");
    expect(result.data).not.toHaveProperty("utm_source");
  });

  it("ignores trusted workspaceId instead of rejecting the lead", () => {
    const result = websiteSchema.safeParse({
      firstName: "John",
      lastName: "Smith",
      email: "john@example.com",
      workspaceId: "000000000000000000000000",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("workspaceId");
    }
  });

  it("maps a 24-char project value to projectId", () => {
    const projectId = "6a943c5ac1e3fb2481c99b0d";
    const result = websiteSchema.safeParse({
      firstName: "John",
      lastName: "Smith",
      email: "john@example.com",
      project: projectId,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.projectId).toBe(projectId);
      expect(result.data.projectReference).toBeUndefined();
    }
  });

  it("still validates budget range after alias mapping", () => {
    const invalid = websiteSchema.safeParse({
      first_name: "John",
      last_name: "Smith",
      email: "john@example.com",
      budget_min: "1000",
      budget_max: "500",
    });

    expect(invalid.success).toBe(false);
  });

  it("still rejects an invalid explicit projectId", () => {
    const result = websiteSchema.safeParse({
      firstName: "John",
      lastName: "Smith",
      email: "john@example.com",
      projectId: "not-an-id",
    });

    expect(result.success).toBe(false);
  });

  it("drops unknown keys from the normalized body", () => {
    const normalized = normalizeWebsiteLeadCaptureBody({
      firstName: "John",
      lastName: "Smith",
      email: "john@example.com",
      lead_type: "download_flyer",
      workspaceId: "abc",
    });

    expect(normalized).toEqual(
      expect.objectContaining({
        firstName: "John",
        lastName: "Smith",
        email: "john@example.com",
      }),
    );
    expect(normalized).not.toHaveProperty("workspaceId");
    expect(normalized).not.toHaveProperty("lead_type");
  });
});
