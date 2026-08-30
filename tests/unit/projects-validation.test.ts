import { describe, expect, it } from "vitest";

import {
  createProjectInputSchema,
  projectListQuerySchema,
  updateProjectInputSchema,
} from "@/server/validation/projects";

describe("project validation schemas", () => {
  it("accepts browser pagination, demand views, and inbound sorts", () => {
    const result = projectListQuerySchema.safeParse({
      page: "2",
      pageSize: "25",
      view: "needs_attention",
      sort: "inbound",
      sortDir: "desc",
      search: "grosvenor",
      withCounts: "true",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(2);
      expect(result.data.view).toBe("needs_attention");
      expect(result.data.sort).toBe("inbound");
    }

    expect(projectListQuerySchema.safeParse({ view: "hot" }).success).toBe(false);
    expect(projectListQuerySchema.safeParse({ pageSize: "250" }).success).toBe(false);
  });

  it("rejects client-provided workspaceId and createdBy on create", () => {
    const withWorkspaceId = createProjectInputSchema.safeParse({
      name: "Green View",
      workspaceId: "507f1f77bcf86cd799439011",
    });
    const withCreatedBy = createProjectInputSchema.safeParse({
      name: "Green View",
      createdBy: "507f1f77bcf86cd799439011",
    });
    const withArchivedAt = createProjectInputSchema.safeParse({
      name: "Green View",
      archivedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(withWorkspaceId.success).toBe(false);
    expect(withCreatedBy.success).toBe(false);
    expect(withArchivedAt.success).toBe(false);
  });

  it("allows clearing optional fields on update via null", () => {
    const result = updateProjectInputSchema.safeParse({
      reference: null,
      address: null,
      city: null,
      country: null,
      description: null,
      commercialStage: null,
      propertyTypeId: null,
      website: null,
      location: null,
      ownerId: null,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reference).toBeNull();
      expect(result.data.address).toBeNull();
      expect(result.data.commercialStage).toBeNull();
      expect(result.data.location).toBeNull();
    }
  });

  it("accepts an edit save that round-trips stored location provenance", () => {
    const result = updateProjectInputSchema.safeParse({
      name: "Petit Saconnex",
      reference: null,
      projectType: null,
      commercialStage: null,
      propertyTypeId: null,
      website: null,
      location: {
        countryCode: "CH",
        countryName: "Switzerland",
        cantonCode: "GE",
        cantonName: "Genève",
        municipality: "Petit Saconnex",
        postalCode: "1209",
        normalizedAddress: null,
        latitude: null,
        longitude: null,
        precision: "locality",
        sourceUrl: null,
        confidence: null,
        reviewStatus: "verified",
        provenance: {
          method: "user_confirmed",
          catalogKey: "petit-saconnex",
          appliedAt: "2026-08-01T00:00:00.000Z",
          previousManual: null,
          notes: "Operator confirmed.",
        },
      },
      address: null,
      city: "Petit Saconnex",
      country: "Switzerland",
      companies: [],
      description: null,
      ownerId: null,
      assignedTo: null,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.location).toMatchObject({
        countryCode: "CH",
        cantonCode: "GE",
        municipality: "Petit Saconnex",
        postalCode: "1209",
      });
      expect(result.data.location && "provenance" in result.data.location).toBe(false);
    }
  });

  it("treats empty location strings as null instead of rejecting the save", () => {
    const result = updateProjectInputSchema.safeParse({
      location: {
        countryCode: "",
        cantonCode: "",
        sourceUrl: "",
        municipality: "Petit Saconnex",
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.location?.countryCode).toBeNull();
      expect(result.data.location?.cantonCode).toBeNull();
      expect(result.data.location?.sourceUrl).toBeNull();
      expect(result.data.location?.municipality).toBe("Petit Saconnex");
    }
  });

  it("accepts structured location filters and rejects stuffing geography into country", () => {
    const list = projectListQuerySchema.safeParse({
      countryCode: "jm",
      cantonCode: "GE",
      municipality: "Kingston",
    });
    expect(list.success).toBe(true);
    if (list.success) {
      expect(list.data.countryCode).toBe("JM");
      expect(list.data.cantonCode).toBe("GE");
    }

    const create = createProjectInputSchema.safeParse({
      name: "Grosvenor Vistas",
      location: {
        countryCode: "jm",
        municipality: "Kingston",
        postalCode: "Kingston 8",
        precision: "address",
      },
    });
    expect(create.success).toBe(true);
    if (create.success) {
      expect(create.data.location?.countryCode).toBe("JM");
    }
  });

  it("accepts commercial stage and company associations", () => {
    const result = createProjectInputSchema.safeParse({
      name: "Les Terrasses",
      commercialStage: "pre_launch",
      location: {
        countryCode: "CH",
        countryName: "Switzerland",
        cantonCode: "GE",
        municipality: "Geneva",
        postalCode: "1201",
        normalizedAddress: "Quai du Mont-Blanc",
      },
      companies: [
        {
          companyId: "507f1f77bcf86cd7994390aa",
          role: "developer",
          isPrimary: true,
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(createProjectInputSchema.safeParse({ name: "X", commercialStage: "active" }).success).toBe(
      false,
    );
    expect(
      createProjectInputSchema.safeParse({
        name: "X",
        companies: [{ companyId: "507f1f77bcf86cd7994390aa", role: "sponsor" }],
      }).success,
    ).toBe(false);
  });
});
