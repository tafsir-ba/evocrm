import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/companies", () => ({
  createCompany: vi.fn(),
  findActiveCompanyByNormalizedName: vi.fn(),
  findCompanies: vi.fn(),
}));

vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: vi.fn(),
}));

import { createAuditLog } from "@/server/audit/create-audit-log";
import {
  createCompany,
  findActiveCompanyByNormalizedName,
} from "@/server/repositories/companies";
import { createCompanyForWorkspace } from "@/server/services/companies";

const existing = {
  id: "507f1f77bcf86cd7994390aa",
  workspaceId: "ws-1",
  name: "Promotor SA",
  nameNormalized: "promotor sa",
  website: null,
  createdBy: "user-1",
  archivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("companies service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the existing company instead of creating a duplicate", async () => {
    vi.mocked(findActiveCompanyByNormalizedName).mockResolvedValue(existing);

    const result = await createCompanyForWorkspace("ws-1", "user-1", {
      name: "  Promotor   SA ",
    });

    expect(result).toEqual({ company: existing, created: false });
    expect(createCompany).not.toHaveBeenCalled();
    expect(createAuditLog).not.toHaveBeenCalled();
  });

  it("creates a company when the normalized name is new", async () => {
    vi.mocked(findActiveCompanyByNormalizedName).mockResolvedValue(null);
    vi.mocked(createCompany).mockResolvedValue({
      ...existing,
      id: "507f1f77bcf86cd7994390bb",
    });

    const result = await createCompanyForWorkspace("ws-1", "user-2", {
      name: "Promotor SA",
    });

    expect(createCompany).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      name: "Promotor SA",
      nameNormalized: "promotor sa",
      website: null,
      createdBy: "user-2",
    });
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "company.created",
        entityType: "company",
      }),
    );
    expect(result.created).toBe(true);
  });
});
