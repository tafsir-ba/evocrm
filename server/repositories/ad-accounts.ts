import "server-only";

import { AdAccountModel, type AdAccountDocument } from "@/models/ad-account";
import { connectDb } from "@/server/db/mongoose";
import { withWorkspaceScope } from "@/server/workspaces/with-workspace-scope";
import type { AdPlatform } from "@/lib/advertising-constants";
import { AD_ACCOUNT_STATUSES } from "@/lib/advertising-constants";

export type AdAccountStatus = (typeof AD_ACCOUNT_STATUSES)[number];

export type AdAccountRecord = {
  id: string;
  workspaceId: string;
  connectionId: string;
  platform: AdPlatform;
  externalAccountId: string;
  name: string;
  currency: string;
  timezone: string;
  status: AdAccountStatus;
  accountLimits: Record<string, unknown> | null;
  lastSuccessfulSyncAt: Date | null;
  lastSyncAttemptAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toRecord(document: AdAccountDocument): AdAccountRecord {
  return {
    id: document._id.toString(),
    workspaceId: document.workspaceId.toString(),
    connectionId: document.connectionId.toString(),
    platform: document.platform as AdPlatform,
    externalAccountId: document.externalAccountId,
    name: document.name,
    currency: document.currency,
    timezone: document.timezone,
    status: document.status as AdAccountStatus,
    accountLimits: (document.accountLimits as Record<string, unknown> | null) ?? null,
    lastSuccessfulSyncAt: document.lastSuccessfulSyncAt ?? null,
    lastSyncAttemptAt: document.lastSyncAttemptAt ?? null,
    archivedAt: document.archivedAt ?? null,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export async function findAdAccounts(
  workspaceId: string,
  filter: { connectionId?: string; includeArchived?: boolean } = {},
): Promise<AdAccountRecord[]> {
  await connectDb();
  const query: Record<string, unknown> = {};
  if (!filter.includeArchived) {
    query.archivedAt = null;
  }
  if (filter.connectionId) {
    query.connectionId = filter.connectionId;
  }

  const documents = await AdAccountModel.find(
    withWorkspaceScope(workspaceId, query),
  )
    .sort({ name: 1 })
    .lean<AdAccountDocument[]>();

  return documents.map(toRecord);
}

export async function findAdAccountById(
  workspaceId: string,
  accountId: string,
): Promise<AdAccountRecord | null> {
  await connectDb();
  const document = await AdAccountModel.findOne(
    withWorkspaceScope(workspaceId, { _id: accountId }),
  ).lean<AdAccountDocument | null>();

  return document ? toRecord(document) : null;
}

export async function createAdAccount(input: {
  workspaceId: string;
  connectionId: string;
  platform: AdPlatform;
  externalAccountId: string;
  name: string;
  currency: string;
  timezone: string;
  status?: AdAccountStatus;
}): Promise<AdAccountRecord> {
  await connectDb();
  const document = await AdAccountModel.create({
    workspaceId: input.workspaceId,
    connectionId: input.connectionId,
    platform: input.platform,
    externalAccountId: input.externalAccountId,
    name: input.name,
    currency: input.currency,
    timezone: input.timezone,
    status: input.status ?? "unknown",
  });

  return toRecord(document.toObject());
}

export async function upsertAdAccount(input: {
  workspaceId: string;
  connectionId: string;
  platform: AdPlatform;
  externalAccountId: string;
  name: string;
  currency: string;
  timezone: string;
  status?: AdAccountStatus;
  lastSuccessfulSyncAt?: Date | null;
  lastSyncAttemptAt?: Date | null;
}): Promise<AdAccountRecord> {
  await connectDb();
  const document = await AdAccountModel.findOneAndUpdate(
    withWorkspaceScope(input.workspaceId, {
      platform: input.platform,
      externalAccountId: input.externalAccountId,
      archivedAt: null,
    }),
    {
      $set: {
        connectionId: input.connectionId,
        name: input.name,
        currency: input.currency,
        timezone: input.timezone,
        status: input.status ?? "unknown",
        lastSuccessfulSyncAt: input.lastSuccessfulSyncAt ?? null,
        lastSyncAttemptAt: input.lastSyncAttemptAt ?? null,
      },
      $setOnInsert: {
        workspaceId: input.workspaceId,
        platform: input.platform,
        externalAccountId: input.externalAccountId,
      },
    },
    { upsert: true, new: true },
  ).lean<AdAccountDocument>();

  if (!document) {
    throw new Error("Failed to upsert ad account");
  }
  return toRecord(document);
}
