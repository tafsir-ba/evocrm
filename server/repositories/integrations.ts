import "server-only";

import {
  IntegrationModel,
  type IntegrationDocument,
  INTEGRATION_STATUSES,
  INTEGRATION_TYPES,
} from "@/models/integration";
import { connectDb } from "@/server/db/mongoose";
import { AppError } from "@/server/errors";
import { withWorkspaceScope } from "@/server/workspaces/with-workspace-scope";

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: number }).code === 11000
  );
}

export type IntegrationType = (typeof INTEGRATION_TYPES)[number];
export type IntegrationStatus = (typeof INTEGRATION_STATUSES)[number];

export type IntegrationRecord = {
  id: string;
  workspaceId: string;
  type: IntegrationType;
  name: string;
  status: IntegrationStatus;
  credentialsEncrypted: string | null;
  apiKeyHash: string | null;
  defaultProjectId: string | null;
  allowProjectOverride: boolean;
  createdBy: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toIntegrationRecord(document: IntegrationDocument): IntegrationRecord {
  return {
    id: document._id.toString(),
    workspaceId: document.workspaceId.toString(),
    type: document.type as IntegrationType,
    name: document.name,
    status: document.status as IntegrationStatus,
    credentialsEncrypted: document.credentialsEncrypted ?? null,
    apiKeyHash: document.apiKeyHash ?? null,
    defaultProjectId: document.defaultProjectId?.toString() ?? null,
    allowProjectOverride: Boolean(document.allowProjectOverride),
    createdBy: document.createdBy.toString(),
    archivedAt: document.archivedAt ?? null,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export type IntegrationListFilter = {
  includeArchived?: boolean;
  type?: IntegrationType;
  status?: IntegrationStatus;
};

function buildListQuery(filter: IntegrationListFilter): Record<string, unknown> {
  const query: Record<string, unknown> = {};

  if (!filter.includeArchived) {
    query.archivedAt = null;
  }

  if (filter.type) {
    query.type = filter.type;
  }

  if (filter.status) {
    query.status = filter.status;
  }

  return query;
}

export async function findIntegrations(
  workspaceId: string,
  filter: IntegrationListFilter = {},
): Promise<IntegrationRecord[]> {
  await connectDb();

  const documents = await IntegrationModel.find(
    withWorkspaceScope(workspaceId, buildListQuery(filter)),
  )
    .sort({ createdAt: -1 })
    .lean<IntegrationDocument[]>();

  return documents.map(toIntegrationRecord);
}

export async function findIntegrationById(
  workspaceId: string,
  integrationId: string,
): Promise<IntegrationRecord | null> {
  await connectDb();

  const document = await IntegrationModel.findOne(
    withWorkspaceScope(workspaceId, { _id: integrationId }),
  ).lean<IntegrationDocument>();

  return document ? toIntegrationRecord(document) : null;
}

export async function findActiveWebsiteIntegrationByApiKeyHash(
  apiKeyHash: string,
): Promise<IntegrationRecord | null> {
  await connectDb();

  const document = await IntegrationModel.findOne({
    apiKeyHash,
    type: "website",
    status: "active",
    archivedAt: null,
  }).lean<IntegrationDocument>();

  return document ? toIntegrationRecord(document) : null;
}

export async function findWebsiteIntegrationByApiKeyHash(
  apiKeyHash: string,
): Promise<IntegrationRecord | null> {
  await connectDb();

  const document = await IntegrationModel.findOne({
    apiKeyHash,
    type: "website",
  }).lean<IntegrationDocument>();

  return document ? toIntegrationRecord(document) : null;
}

export async function createIntegration(input: {
  workspaceId: string;
  type: IntegrationType;
  name: string;
  status: IntegrationStatus;
  apiKeyHash?: string | null;
  defaultProjectId?: string | null;
  allowProjectOverride?: boolean;
  createdBy: string;
}): Promise<IntegrationRecord> {
  await connectDb();

  try {
    const document = await IntegrationModel.create({
      workspaceId: input.workspaceId,
      type: input.type,
      name: input.name.trim(),
      status: input.status,
      apiKeyHash: input.apiKeyHash ?? null,
      defaultProjectId: input.defaultProjectId ?? null,
      allowProjectOverride: input.allowProjectOverride ?? false,
      createdBy: input.createdBy,
    });

    return toIntegrationRecord(document);
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new AppError("CONFLICT", "An integration with this API key already exists.");
    }

    throw error;
  }
}

export async function updateIntegration(
  workspaceId: string,
  integrationId: string,
  update: {
    name?: string;
    status?: IntegrationStatus;
    apiKeyHash?: string | null;
    defaultProjectId?: string | null;
    allowProjectOverride?: boolean;
    archivedAt?: Date | null;
  },
): Promise<IntegrationRecord | null> {
  await connectDb();

  try {
    const document = await IntegrationModel.findOneAndUpdate(
      withWorkspaceScope(workspaceId, { _id: integrationId }),
      { $set: update },
      { new: true },
    ).lean<IntegrationDocument>();

    return document ? toIntegrationRecord(document) : null;
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new AppError("CONFLICT", "An integration with this API key already exists.");
    }

    throw error;
  }
}
