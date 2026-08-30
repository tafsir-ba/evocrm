import { describe, expect, it } from "vitest";

import {
  normalizeCompanyNameKey,
  normalizeProjectCompanies,
  primaryDeveloperCompanyId,
} from "@/lib/project-operating-record";

describe("project operating record", () => {
  it("normalizes company names for duplicate-safe lookup", () => {
    expect(normalizeCompanyNameKey("  Promotor   SA ")).toBe("promotor sa");
  });

  it("dedupes the same company+role and keeps one primary developer", () => {
    const associations = normalizeProjectCompanies([
      { companyId: "dev-1", role: "developer", isPrimary: true },
      { companyId: "dev-1", role: "developer", isPrimary: true },
      { companyId: "own-1", role: "owner", isPrimary: true },
    ]);

    expect(associations).toEqual([
      { companyId: "dev-1", role: "developer", isPrimary: true },
      { companyId: "own-1", role: "owner", isPrimary: false },
    ]);
    expect(primaryDeveloperCompanyId(associations)).toBe("dev-1");
  });

  it("promotes the only developer to primary when none is marked", () => {
    const associations = normalizeProjectCompanies([
      { companyId: "dev-1", role: "developer" },
      { companyId: "partner-1", role: "marketing_sales_partner" },
    ]);

    expect(associations.find((item) => item.role === "developer")?.isPrimary).toBe(true);
    expect(primaryDeveloperCompanyId(associations)).toBe("dev-1");
  });

  it("keeps a single primary when several developers are sent", () => {
    const associations = normalizeProjectCompanies([
      { companyId: "dev-1", role: "developer", isPrimary: true },
      { companyId: "dev-2", role: "developer", isPrimary: true },
    ]);

    expect(associations.filter((item) => item.isPrimary)).toEqual([
      { companyId: "dev-1", role: "developer", isPrimary: true },
    ]);
    expect(associations.find((item) => item.companyId === "dev-2")?.isPrimary).toBe(false);
  });

  it("never treats a non-developer as the primary company", () => {
    const associations = normalizeProjectCompanies([
      { companyId: "own-1", role: "owner", isPrimary: true },
    ]);

    expect(associations[0]?.isPrimary).toBe(false);
    expect(primaryDeveloperCompanyId(associations)).toBeNull();
  });
});
