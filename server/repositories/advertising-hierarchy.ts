import "server-only";

import {
  AdvertisingCampaignModel,
  type AdvertisingCampaignDocument,
} from "@/models/advertising-campaign";
import { AdGroupModel, type AdGroupDocument } from "@/models/ad-group";
import { AdModel, type AdDocument } from "@/models/ad";
import {
  MetricSnapshotModel,
  type MetricSnapshotDocument,
} from "@/models/metric-snapshot";
import { connectDb } from "@/server/db/mongoose";
import { withWorkspaceScope } from "@/server/workspaces/with-workspace-scope";

export type AdvertisingCampaignRecord = {
  id: string;
  workspaceId: string;
  adAccountId: string;
  growthCampaignId: string | null;
  platform: string;
  externalCampaignId: string;
  name: string;
  status: string;
  objective: string | null;
  lastSuccessfulSyncAt: Date | null;
};

function toCampaign(document: AdvertisingCampaignDocument): AdvertisingCampaignRecord {
  return {
    id: document._id.toString(),
    workspaceId: document.workspaceId.toString(),
    adAccountId: document.adAccountId.toString(),
    growthCampaignId: document.growthCampaignId?.toString() ?? null,
    platform: document.platform,
    externalCampaignId: document.externalCampaignId,
    name: document.name,
    status: document.status,
    objective: document.objective ?? null,
    lastSuccessfulSyncAt: document.lastSuccessfulSyncAt ?? null,
  };
}

export async function upsertAdvertisingCampaign(input: {
  workspaceId: string;
  adAccountId: string;
  growthCampaignId?: string | null;
  platform: "meta";
  externalCampaignId: string;
  name: string;
  status: string;
  objective?: string | null;
  observedState?: Record<string, unknown> | null;
  syncedAt: Date;
}): Promise<AdvertisingCampaignRecord> {
  await connectDb();
  const document = await AdvertisingCampaignModel.findOneAndUpdate(
    withWorkspaceScope(input.workspaceId, {
      platform: input.platform,
      externalCampaignId: input.externalCampaignId,
      archivedAt: null,
    }),
    {
      $set: {
        adAccountId: input.adAccountId,
        growthCampaignId: input.growthCampaignId ?? null,
        name: input.name,
        status: input.status,
        objective: input.objective ?? null,
        observedState: input.observedState ?? null,
        lastSuccessfulSyncAt: input.syncedAt,
      },
      $setOnInsert: {
        workspaceId: input.workspaceId,
        platform: input.platform,
        externalCampaignId: input.externalCampaignId,
      },
    },
    { upsert: true, new: true },
  ).lean<AdvertisingCampaignDocument>();

  if (!document) {
    throw new Error("Failed to upsert advertising campaign");
  }
  return toCampaign(document);
}

export async function findAdvertisingCampaigns(
  workspaceId: string,
  filter: { adAccountId?: string; growthCampaignId?: string } = {},
): Promise<AdvertisingCampaignRecord[]> {
  await connectDb();
  const query: Record<string, unknown> = { archivedAt: null };
  if (filter.adAccountId) query.adAccountId = filter.adAccountId;
  if (filter.growthCampaignId) query.growthCampaignId = filter.growthCampaignId;

  const documents = await AdvertisingCampaignModel.find(
    withWorkspaceScope(workspaceId, query),
  )
    .sort({ name: 1 })
    .lean<AdvertisingCampaignDocument[]>();

  return documents.map(toCampaign);
}

export type AdGroupRecord = {
  id: string;
  workspaceId: string;
  adAccountId: string;
  advertisingCampaignId: string;
  externalAdGroupId: string;
  name: string;
  status: string;
};

export async function upsertAdGroup(input: {
  workspaceId: string;
  adAccountId: string;
  advertisingCampaignId: string;
  platform: "meta";
  externalAdGroupId: string;
  name: string;
  status: string;
  observedState?: Record<string, unknown> | null;
  syncedAt: Date;
}): Promise<AdGroupRecord> {
  await connectDb();
  const document = await AdGroupModel.findOneAndUpdate(
    withWorkspaceScope(input.workspaceId, {
      platform: input.platform,
      externalAdGroupId: input.externalAdGroupId,
      archivedAt: null,
    }),
    {
      $set: {
        adAccountId: input.adAccountId,
        advertisingCampaignId: input.advertisingCampaignId,
        name: input.name,
        status: input.status,
        observedState: input.observedState ?? null,
        lastSuccessfulSyncAt: input.syncedAt,
      },
      $setOnInsert: {
        workspaceId: input.workspaceId,
        platform: input.platform,
        externalAdGroupId: input.externalAdGroupId,
      },
    },
    { upsert: true, new: true },
  ).lean<AdGroupDocument>();

  if (!document) {
    throw new Error("Failed to upsert ad group");
  }

  return {
    id: document._id.toString(),
    workspaceId: document.workspaceId.toString(),
    adAccountId: document.adAccountId.toString(),
    advertisingCampaignId: document.advertisingCampaignId.toString(),
    externalAdGroupId: document.externalAdGroupId,
    name: document.name,
    status: document.status,
  };
}

export async function findAdGroups(
  workspaceId: string,
  filter: { advertisingCampaignId?: string; adAccountId?: string } = {},
): Promise<AdGroupRecord[]> {
  await connectDb();
  const query: Record<string, unknown> = { archivedAt: null };
  if (filter.advertisingCampaignId) {
    query.advertisingCampaignId = filter.advertisingCampaignId;
  }
  if (filter.adAccountId) query.adAccountId = filter.adAccountId;

  const documents = await AdGroupModel.find(withWorkspaceScope(workspaceId, query))
    .sort({ name: 1 })
    .lean<AdGroupDocument[]>();

  return documents.map((document) => ({
    id: document._id.toString(),
    workspaceId: document.workspaceId.toString(),
    adAccountId: document.adAccountId.toString(),
    advertisingCampaignId: document.advertisingCampaignId.toString(),
    externalAdGroupId: document.externalAdGroupId,
    name: document.name,
    status: document.status,
  }));
}

export type AdRecord = {
  id: string;
  workspaceId: string;
  adAccountId: string;
  advertisingCampaignId: string;
  adGroupId: string;
  externalAdId: string;
  name: string;
  status: string;
};

export async function upsertAd(input: {
  workspaceId: string;
  adAccountId: string;
  advertisingCampaignId: string;
  adGroupId: string;
  platform: "meta";
  externalAdId: string;
  name: string;
  status: string;
  observedState?: Record<string, unknown> | null;
  syncedAt: Date;
}): Promise<AdRecord> {
  await connectDb();
  const document = await AdModel.findOneAndUpdate(
    withWorkspaceScope(input.workspaceId, {
      platform: input.platform,
      externalAdId: input.externalAdId,
      archivedAt: null,
    }),
    {
      $set: {
        adAccountId: input.adAccountId,
        advertisingCampaignId: input.advertisingCampaignId,
        adGroupId: input.adGroupId,
        name: input.name,
        status: input.status,
        observedState: input.observedState ?? null,
        lastSuccessfulSyncAt: input.syncedAt,
      },
      $setOnInsert: {
        workspaceId: input.workspaceId,
        platform: input.platform,
        externalAdId: input.externalAdId,
      },
    },
    { upsert: true, new: true },
  ).lean<AdDocument>();

  if (!document) {
    throw new Error("Failed to upsert ad");
  }

  return {
    id: document._id.toString(),
    workspaceId: document.workspaceId.toString(),
    adAccountId: document.adAccountId.toString(),
    advertisingCampaignId: document.advertisingCampaignId.toString(),
    adGroupId: document.adGroupId.toString(),
    externalAdId: document.externalAdId,
    name: document.name,
    status: document.status,
  };
}

export async function findAds(
  workspaceId: string,
  filter: { adGroupId?: string; adAccountId?: string } = {},
): Promise<AdRecord[]> {
  await connectDb();
  const query: Record<string, unknown> = { archivedAt: null };
  if (filter.adGroupId) query.adGroupId = filter.adGroupId;
  if (filter.adAccountId) query.adAccountId = filter.adAccountId;

  const documents = await AdModel.find(withWorkspaceScope(workspaceId, query))
    .sort({ name: 1 })
    .lean<AdDocument[]>();

  return documents.map((document) => ({
    id: document._id.toString(),
    workspaceId: document.workspaceId.toString(),
    adAccountId: document.adAccountId.toString(),
    advertisingCampaignId: document.advertisingCampaignId.toString(),
    adGroupId: document.adGroupId.toString(),
    externalAdId: document.externalAdId,
    name: document.name,
    status: document.status,
  }));
}

export async function upsertMetricSnapshot(input: {
  workspaceId: string;
  platform: "meta";
  adAccountId: string;
  entityKind: "account" | "campaign" | "ad_group" | "ad";
  entityId: string;
  externalEntityId: string;
  date: string;
  metrics: Record<string, number>;
  capturedAt: Date;
}): Promise<void> {
  await connectDb();
  await MetricSnapshotModel.findOneAndUpdate(
    withWorkspaceScope(input.workspaceId, {
      platform: input.platform,
      entityKind: input.entityKind,
      externalEntityId: input.externalEntityId,
      date: input.date,
    }),
    {
      $set: {
        adAccountId: input.adAccountId,
        entityId: input.entityId,
        metrics: {
          spend: input.metrics.spend ?? 0,
          impressions: input.metrics.impressions ?? 0,
          reach: input.metrics.reach ?? 0,
          clicks: input.metrics.clicks ?? 0,
          cpc: input.metrics.cpc ?? null,
          cpm: input.metrics.cpm ?? null,
          ctr: input.metrics.ctr ?? null,
        },
        metricTier: 5,
        capturedAt: input.capturedAt,
      },
      $setOnInsert: {
        workspaceId: input.workspaceId,
        platform: input.platform,
        entityKind: input.entityKind,
        externalEntityId: input.externalEntityId,
        date: input.date,
      },
    },
    { upsert: true, new: true },
  );
}

export async function findMetricSnapshots(
  workspaceId: string,
  filter: { adAccountId?: string; limit?: number } = {},
): Promise<
  Array<{
    id: string;
    date: string;
    entityKind: string;
    externalEntityId: string;
    metrics: Record<string, number | null>;
  }>
> {
  await connectDb();
  const query: Record<string, unknown> = {};
  if (filter.adAccountId) query.adAccountId = filter.adAccountId;

  const documents = await MetricSnapshotModel.find(
    withWorkspaceScope(workspaceId, query),
  )
    .sort({ date: -1 })
    .limit(filter.limit ?? 100)
    .lean<MetricSnapshotDocument[]>();

  return documents.map((document) => ({
    id: document._id.toString(),
    date: document.date,
    entityKind: document.entityKind,
    externalEntityId: document.externalEntityId,
    metrics: {
      spend: document.metrics?.spend ?? 0,
      impressions: document.metrics?.impressions ?? 0,
      reach: document.metrics?.reach ?? 0,
      clicks: document.metrics?.clicks ?? 0,
      cpc: document.metrics?.cpc ?? null,
      cpm: document.metrics?.cpm ?? null,
      ctr: document.metrics?.ctr ?? null,
    },
  }));
}

/** Cross-workspace guard helper for tests. */
export async function countAdvertisingCampaignsInWorkspace(
  workspaceId: string,
): Promise<number> {
  await connectDb();
  return AdvertisingCampaignModel.countDocuments(
    withWorkspaceScope(workspaceId, { archivedAt: null }),
  );
}
