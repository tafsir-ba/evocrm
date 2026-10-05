import "server-only";

import {
  GrowthCampaignModel,
  type GrowthCampaignDocument,
} from "@/models/growth-campaign";
import { connectDb } from "@/server/db/mongoose";
import { withWorkspaceScope } from "@/server/workspaces/with-workspace-scope";
import { GROWTH_CAMPAIGN_STATUSES } from "@/lib/advertising-constants";
import { assertGrowthCampaignProjectId } from "@/server/advertising/routing/project-invariant";

export type GrowthCampaignStatus = (typeof GROWTH_CAMPAIGN_STATUSES)[number];

export type TrustedDestinationRecord = {
  id: string;
  destinationKey: string;
  label: string | null;
  websiteIntegrationId: string | null;
  projectLocked: boolean;
};

export type GrowthCampaignRecord = {
  id: string;
  workspaceId: string;
  projectId: string;
  name: string;
  status: GrowthCampaignStatus;
  objective: string | null;
  marketCountryCode: string | null;
  budgetEnvelope: {
    currency: string | null;
    totalCap: number | null;
    dailyCap: number | null;
  };
  outcomeTarget: string | null;
  linkedDripCampaignId: string | null;
  attributionKey: string | null;
  trustedDestinations: TrustedDestinationRecord[];
  attributionPolicy: "last_touch" | "first_touch" | "weighted";
  createdBy: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toRecord(document: GrowthCampaignDocument): GrowthCampaignRecord {
  const destinations = (document.trustedDestinations ?? []).map((dest) => {
    const withId = dest as typeof dest & { _id?: { toString(): string } };
    return {
      id: withId._id?.toString() ?? "",
      destinationKey: dest.destinationKey,
      label: dest.label ?? null,
      websiteIntegrationId: dest.websiteIntegrationId?.toString() ?? null,
      projectLocked: dest.projectLocked !== false,
    };
  });

  return {
    id: document._id.toString(),
    workspaceId: document.workspaceId.toString(),
    projectId: document.projectId.toString(),
    name: document.name,
    status: document.status as GrowthCampaignStatus,
    objective: document.objective ?? null,
    marketCountryCode: document.marketCountryCode ?? null,
    budgetEnvelope: {
      currency: document.budgetEnvelope?.currency ?? null,
      totalCap: document.budgetEnvelope?.totalCap ?? null,
      dailyCap: document.budgetEnvelope?.dailyCap ?? null,
    },
    outcomeTarget: document.outcomeTarget ?? null,
    linkedDripCampaignId: document.linkedDripCampaignId?.toString() ?? null,
    attributionKey: document.attributionKey ?? null,
    trustedDestinations: destinations,
    attributionPolicy:
      (document.attributionPolicy as GrowthCampaignRecord["attributionPolicy"]) ??
      "last_touch",
    createdBy: document.createdBy.toString(),
    archivedAt: document.archivedAt ?? null,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export async function findGrowthCampaigns(
  workspaceId: string,
  filter: { projectId?: string; includeArchived?: boolean } = {},
): Promise<GrowthCampaignRecord[]> {
  await connectDb();
  const query: Record<string, unknown> = {};
  if (!filter.includeArchived) {
    query.archivedAt = null;
  }
  if (filter.projectId) {
    query.projectId = filter.projectId;
  }

  const documents = await GrowthCampaignModel.find(
    withWorkspaceScope(workspaceId, query),
  )
    .sort({ createdAt: -1 })
    .lean<GrowthCampaignDocument[]>();

  return documents.map(toRecord);
}

export async function findGrowthCampaignById(
  workspaceId: string,
  growthCampaignId: string,
): Promise<GrowthCampaignRecord | null> {
  await connectDb();
  const document = await GrowthCampaignModel.findOne(
    withWorkspaceScope(workspaceId, { _id: growthCampaignId }),
  ).lean<GrowthCampaignDocument | null>();

  return document ? toRecord(document) : null;
}

export async function createGrowthCampaign(input: {
  workspaceId: string;
  projectId: string;
  name: string;
  createdBy: string;
  objective?: string | null;
  marketCountryCode?: string | null;
  outcomeTarget?: string | null;
  linkedDripCampaignId?: string | null;
  attributionKey?: string | null;
}): Promise<GrowthCampaignRecord> {
  const projectId = assertGrowthCampaignProjectId(input.projectId);
  await connectDb();

  const document = await GrowthCampaignModel.create({
    workspaceId: input.workspaceId,
    projectId,
    name: input.name,
    status: "draft",
    objective: input.objective ?? null,
    marketCountryCode: input.marketCountryCode ?? null,
    outcomeTarget: input.outcomeTarget ?? null,
    linkedDripCampaignId: input.linkedDripCampaignId ?? null,
    attributionKey: input.attributionKey ?? null,
    attributionPolicy: "last_touch",
    trustedDestinations: [],
    createdBy: input.createdBy,
  });

  return toRecord(document.toObject());
}

/**
 * Idempotent trusted destination upsert by destinationKey.
 * Destinations always lock leads to the Growth Campaign projectId.
 */
export async function addTrustedDestination(
  workspaceId: string,
  growthCampaignId: string,
  destination: {
    destinationKey: string;
    label?: string | null;
    websiteIntegrationId?: string | null;
  },
): Promise<GrowthCampaignRecord> {
  await connectDb();
  const existing = await GrowthCampaignModel.findOne(
    withWorkspaceScope(workspaceId, { _id: growthCampaignId, archivedAt: null }),
  );

  if (!existing) {
    throw new Error("Growth Campaign not found.");
  }

  const key = destination.destinationKey.trim();
  const already = (existing.trustedDestinations ?? []).some(
    (row) => row.destinationKey === key,
  );

  if (!already) {
    existing.trustedDestinations.push({
      destinationKey: key,
      label: destination.label ?? null,
      websiteIntegrationId: destination.websiteIntegrationId ?? null,
      projectLocked: true,
    });
    await existing.save();
  }

  return toRecord(existing.toObject());
}
