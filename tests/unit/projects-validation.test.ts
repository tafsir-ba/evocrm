import { describe, expect, it } from "vitest";

import {
  createProjectInputSchema,
  updateProjectInputSchema,
} from "@/server/validation/projects";

describe("project validation schemas", () => {
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
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reference).toBeNull();
      expect(result.data.address).toBeNull();
    }
  });
});
