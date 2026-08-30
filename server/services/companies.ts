import "server-only";

import { normalizeCompanyNameKey } from "@/lib/project-operating-record";
import { createAuditLog } from "@/server/audit/create-audit-log";
import {
  createCompany,
  findActiveCompanyByNormalizedName,
  findCompanies,
  type CompanyRecord,
} from "@/server/repositories/companies";
import type { CreateCompanyInput } from "@/server/validation/companies";

export async function listCompaniesForWorkspace(
  workspaceId: string,
  filter: { search?: string } = {},
): Promise<CompanyRecord[]> {
  return findCompanies(workspaceId, filter);
}

export async function createCompanyForWorkspace(
  workspaceId: string,
  actorId: string,
  input: CreateCompanyInput,
): Promise<{ company: CompanyRecord; created: boolean }> {
  const nameNormalized = normalizeCompanyNameKey(input.name);
  const existing = await findActiveCompanyByNormalizedName(workspaceId, nameNormalized);

  if (existing) {
    return { company: existing, created: false };
  }

  const company = await createCompany({
    workspaceId,
    name: input.name.trim(),
    nameNormalized,
    website: input.website ?? null,
    createdBy: actorId,
  });

  await createAuditLog({
    workspaceId,
    actorId,
    action: "company.created",
    entityType: "company",
    entityId: company.id,
    after: { name: company.name },
  });

  return { company, created: true };
}
