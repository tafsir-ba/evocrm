import "server-only";

import { CompanyModel, type CompanyDocument } from "@/models/company";
import { connectDb } from "@/server/db/mongoose";
import { isValidObjectId } from "@/server/utils/mongo-id";
import { withWorkspaceScope } from "@/server/workspaces/with-workspace-scope";

export type CompanyRecord = {
  id: string;
  workspaceId: string;
  name: string;
  nameNormalized: string;
  website: string | null;
  createdBy: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toCompanyRecord(document: CompanyDocument): CompanyRecord {
  return {
    id: document._id.toString(),
    workspaceId: document.workspaceId.toString(),
    name: document.name,
    nameNormalized: document.nameNormalized,
    website: document.website ?? null,
    createdBy: document.createdBy.toString(),
    archivedAt: document.archivedAt ?? null,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export async function findCompanies(
  workspaceId: string,
  filter: { search?: string } = {},
): Promise<CompanyRecord[]> {
  await connectDb();
  const query: Record<string, unknown> = { archivedAt: null };

  if (filter.search) {
    const escaped = filter.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    query.name = new RegExp(escaped, "i");
  }

  const documents = await CompanyModel.find(withWorkspaceScope(workspaceId, query))
    .sort({ name: 1 })
    .limit(50)
    .lean<CompanyDocument[]>();

  return documents.map(toCompanyRecord);
}

export async function findCompanyById(
  workspaceId: string,
  companyId: string,
): Promise<CompanyRecord | null> {
  if (!isValidObjectId(companyId)) {
    return null;
  }

  await connectDb();
  const document = await CompanyModel.findOne(
    withWorkspaceScope(workspaceId, { _id: companyId, archivedAt: null }),
  ).lean<CompanyDocument>();
  return document ? toCompanyRecord(document) : null;
}

export async function findCompaniesByIds(
  workspaceId: string,
  companyIds: string[],
): Promise<CompanyRecord[]> {
  const validIds = companyIds.filter((id) => isValidObjectId(id));
  if (validIds.length === 0) {
    return [];
  }

  await connectDb();
  const documents = await CompanyModel.find(
    withWorkspaceScope(workspaceId, { _id: { $in: validIds }, archivedAt: null }),
  ).lean<CompanyDocument[]>();
  return documents.map(toCompanyRecord);
}

export async function findActiveCompanyByNormalizedName(
  workspaceId: string,
  nameNormalized: string,
): Promise<CompanyRecord | null> {
  await connectDb();
  const document = await CompanyModel.findOne(
    withWorkspaceScope(workspaceId, {
      nameNormalized,
      archivedAt: null,
    }),
  ).lean<CompanyDocument>();
  return document ? toCompanyRecord(document) : null;
}

export async function createCompany(input: {
  workspaceId: string;
  name: string;
  nameNormalized: string;
  website?: string | null;
  createdBy: string;
}): Promise<CompanyRecord> {
  await connectDb();
  const document = await CompanyModel.create({
    workspaceId: input.workspaceId,
    name: input.name.trim(),
    nameNormalized: input.nameNormalized,
    website: input.website?.trim() || null,
    createdBy: input.createdBy,
    archivedAt: null,
  });
  return toCompanyRecord(document.toObject() as CompanyDocument);
}
