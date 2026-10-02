import "server-only";

import {
  AdConnectionModel,
  type AdConnectionDocument,
} from "@/models/ad-connection";
import { connectDb } from "@/server/db/mongoose";
import { withWorkspaceScope } from "@/server/workspaces/with-workspace-scope";
import type { AdPlatform } from "@/lib/advertising-constants";
import { AD_CONNECTION_STATUSES } from "@/lib/advertising-constants";

export type AdConnectionStatus = (typeof AD_CONNECTION_STATUSES)[number];

export type AdConnectionRecord = {
  id: string;
  workspaceId: string;
  platform: AdPlatform;
  name: string;
  status: AdConnectionStatus;
  credentialsEncrypted: string | null;
  externalBusinessId: string | null;
  grantedScopes: string[];
  writeScopesEnabled: boolean;
  healthMessage: string | null;
  lastSuccessfulSyncAt: Date | null;
  lastSyncAttemptAt: Date | null;
  lastSyncError: string | null;
  createdBy: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toRecord(document: AdConnectionDocument): AdConnectionRecord {
  return {
    id: document._id.toString(),
    workspaceId: document.workspaceId.toString(),
    platform: document.platform as AdPlatform,
    name: document.name,
    status: document.status as AdConnectionStatus,
    credentialsEncrypted: document.credentialsEncrypted ?? null,
    externalBusinessId: document.externalBusinessId ?? null,
    grantedScopes: [...(document.grantedScopes ?? [])],
    writeScopesEnabled: Boolean(document.writeScopesEnabled),
    healthMessage: document.healthMessage ?? null,
    lastSuccessfulSyncAt: document.lastSuccessfulSyncAt ?? null,
    lastSyncAttemptAt: document.lastSyncAttemptAt ?? null,
    lastSyncError: document.lastSyncError ?? null,
    createdBy: document.createdBy.toString(),
    archivedAt: document.archivedAt ?? null,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export async function findAdConnections(
  workspaceId: string,
  filter: { includeArchived?: boolean; platform?: AdPlatform } = {},
): Promise<AdConnectionRecord[]> {
  await connectDb();
  const query: Record<string, unknown> = {};
  if (!filter.includeArchived) {
    query.archivedAt = null;
  }
  if (filter.platform) {
    query.platform = filter.platform;
  }

  const documents = await AdConnectionModel.find(
    withWorkspaceScope(workspaceId, query),
  )
    .sort({ createdAt: -1 })
    .lean<AdConnectionDocument[]>();

  return documents.map(toRecord);
}

export async function findAdConnectionById(
  workspaceId: string,
  connectionId: string,
): Promise<AdConnectionRecord | null> {
  await connectDb();
  const document = await AdConnectionModel.findOne(
    withWorkspaceScope(workspaceId, { _id: connectionId }),
  ).lean<AdConnectionDocument | null>();

  return document ? toRecord(document) : null;
}

export async function createAdConnection(input: {
  workspaceId: string;
  platform: AdPlatform;
  name: string;
  createdBy: string;
  status?: AdConnectionStatus;
  credentialsEncrypted?: string | null;
  externalBusinessId?: string | null;
  grantedScopes?: string[];
}): Promise<AdConnectionRecord> {
  await connectDb();
  const document = await AdConnectionModel.create({
    workspaceId: input.workspaceId,
    platform: input.platform,
    name: input.name,
    status: input.status ?? "draft",
    credentialsEncrypted: input.credentialsEncrypted ?? null,
    externalBusinessId: input.externalBusinessId ?? null,
    grantedScopes: input.grantedScopes ?? [],
    writeScopesEnabled: false,
    createdBy: input.createdBy,
  });

  return toRecord(document.toObject());
}

export async function updateAdConnection(
  workspaceId: string,
  connectionId: string,
  patch: Partial<{
    name: string;
    status: AdConnectionStatus;
    credentialsEncrypted: string | null;
    externalBusinessId: string | null;
    grantedScopes: string[];
    healthMessage: string | null;
    lastSuccessfulSyncAt: Date | null;
    lastSyncAttemptAt: Date | null;
    lastSyncError: string | null;
  }>,
): Promise<AdConnectionRecord | null> {
  await connectDb();
  const document = await AdConnectionModel.findOneAndUpdate(
    withWorkspaceScope(workspaceId, { _id: connectionId, archivedAt: null }),
    { $set: patch },
    { new: true },
  ).lean<AdConnectionDocument | null>();

  return document ? toRecord(document) : null;
}
