import "server-only";

import { createAuditLog } from "@/server/audit/create-audit-log";
import { AppError } from "@/server/errors";
import { findMembership } from "@/server/repositories/memberships";
import {
  archiveCampaign,
  createCampaign,
  findCampaignById,
  findCampaigns,
  updateCampaign,
  type CampaignListFilter,
  type CampaignRecord,
} from "@/server/repositories/campaigns";
import {
  countCampaignEnrollments,
  pauseEnrollmentsForCampaign,
  resumeEnrollmentsForCampaign,
} from "@/server/repositories/campaign-enrollments";
import { countCampaignSteps } from "@/server/repositories/campaign-steps";
import type {
  CreateCampaignInput,
  UpdateCampaignInput,
} from "@/server/validation/campaigns";

export type CampaignListItem = CampaignRecord & {
  stepCount: number;
  enrollmentCount: number;
};

export type CampaignDetail = CampaignListItem;

function campaignSnapshot(campaign: CampaignRecord): Record<string, unknown> {
  return {
    id: campaign.id,
    name: campaign.name,
    status: campaign.status,
    audienceType: campaign.audienceType,
    frequency: campaign.frequency,
    ownerId: campaign.ownerId,
  };
}

async function validateOptionalOwner(
  workspaceId: string,
  ownerId: string | null | undefined,
): Promise<void> {
  if (!ownerId) {
    return;
  }

  const membership = await findMembership(ownerId, workspaceId);

  if (!membership || membership.status !== "active") {
    throw new AppError(
      "VALIDATION_ERROR",
      "ownerId must refer to an active workspace member.",
    );
  }
}

async function enrichCampaign(
  workspaceId: string,
  campaign: CampaignRecord,
): Promise<CampaignListItem> {
  const [stepCount, enrollmentCount] = await Promise.all([
    countCampaignSteps(workspaceId, campaign.id),
    countCampaignEnrollments(workspaceId, campaign.id),
  ]);

  return { ...campaign, stepCount, enrollmentCount };
}

export async function listCampaignsForWorkspace(
  workspaceId: string,
  filter: CampaignListFilter = {},
): Promise<{ campaigns: CampaignListItem[]; total: number }> {
  const { campaigns, total } = await findCampaigns(workspaceId, filter);

  const enriched = await Promise.all(
    campaigns.map((campaign) => enrichCampaign(workspaceId, campaign)),
  );

  return { campaigns: enriched, total };
}

export async function getCampaignForWorkspace(
  workspaceId: string,
  campaignId: string,
): Promise<CampaignDetail> {
  const campaign = await findCampaignById(workspaceId, campaignId);

  if (!campaign) {
    throw new AppError("NOT_FOUND", "Campaign not found.");
  }

  return enrichCampaign(workspaceId, campaign);
}

export async function createCampaignForWorkspace(
  workspaceId: string,
  actorId: string,
  input: CreateCampaignInput,
): Promise<CampaignDetail> {
  await validateOptionalOwner(workspaceId, input.ownerId);

  const campaign = await createCampaign(workspaceId, {
    name: input.name,
    audienceType: input.audienceType,
    frequency: input.frequency ?? null,
    createdBy: actorId,
    ownerId: input.ownerId ?? null,
  });

  await createAuditLog({
    workspaceId,
    actorId,
    action: "campaign.created",
    entityType: "campaign",
    entityId: campaign.id,
    after: campaignSnapshot(campaign),
  });

  return enrichCampaign(workspaceId, campaign);
}

function assertAllowedStatusTransition(
  current: CampaignRecord["status"],
  next: CampaignRecord["status"],
): void {
  if (current === next) {
    return;
  }

  if (current === "archived") {
    throw new AppError("VALIDATION_ERROR", "Archived campaigns cannot be updated.");
  }

  const allowed: Record<CampaignRecord["status"], CampaignRecord["status"][]> = {
    draft: ["draft", "active"],
    active: ["active", "paused"],
    paused: ["paused", "active"],
    archived: ["archived"],
  };

  if (!allowed[current].includes(next)) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Cannot transition campaign from ${current} to ${next}.`,
    );
  }
}

export async function updateCampaignForWorkspace(
  workspaceId: string,
  actorId: string,
  campaignId: string,
  input: UpdateCampaignInput,
): Promise<CampaignDetail> {
  const existing = await findCampaignById(workspaceId, campaignId);

  if (!existing) {
    throw new AppError("NOT_FOUND", "Campaign not found.");
  }

  if (input.status) {
    assertAllowedStatusTransition(existing.status, input.status);

    if (input.status === "active") {
      const stepCount = await countCampaignSteps(workspaceId, campaignId);

      if (stepCount < 1) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Campaign must have at least one step before activation.",
        );
      }
    }
  }

  if (input.ownerId !== undefined) {
    await validateOptionalOwner(workspaceId, input.ownerId);
  }

  const updated = await updateCampaign(workspaceId, campaignId, {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.frequency !== undefined ? { frequency: input.frequency } : {}),
    ...(input.ownerId !== undefined ? { ownerId: input.ownerId } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
  });

  if (!updated) {
    throw new AppError("NOT_FOUND", "Campaign not found.");
  }

  if (input.status === "paused" && existing.status === "active") {
    await pauseEnrollmentsForCampaign(workspaceId, campaignId);
  }

  if (input.status === "active" && existing.status === "paused") {
    await resumeEnrollmentsForCampaign(workspaceId, campaignId);
  }

  const auditAction =
    input.status === "paused" && existing.status === "active"
      ? "campaign.paused"
      : input.status === "active" && existing.status === "paused"
        ? "campaign.resumed"
        : "campaign.updated";

  await createAuditLog({
    workspaceId,
    actorId,
    action: auditAction,
    entityType: "campaign",
    entityId: updated.id,
    before: campaignSnapshot(existing),
    after: campaignSnapshot(updated),
  });

  return enrichCampaign(workspaceId, updated);
}

export async function pauseCampaignForWorkspace(
  workspaceId: string,
  actorId: string,
  campaignId: string,
): Promise<CampaignDetail> {
  const existing = await findCampaignById(workspaceId, campaignId);

  if (!existing) {
    throw new AppError("NOT_FOUND", "Campaign not found.");
  }

  if (existing.status !== "active") {
    throw new AppError("VALIDATION_ERROR", "Only active campaigns can be paused.");
  }

  const updated = await updateCampaign(workspaceId, campaignId, { status: "paused" });

  if (!updated) {
    throw new AppError("NOT_FOUND", "Campaign not found.");
  }

  await pauseEnrollmentsForCampaign(workspaceId, campaignId);

  await createAuditLog({
    workspaceId,
    actorId,
    action: "campaign.paused",
    entityType: "campaign",
    entityId: updated.id,
    before: campaignSnapshot(existing),
    after: campaignSnapshot(updated),
  });

  return enrichCampaign(workspaceId, updated);
}

export async function resumeCampaignForWorkspace(
  workspaceId: string,
  actorId: string,
  campaignId: string,
): Promise<CampaignDetail> {
  const existing = await findCampaignById(workspaceId, campaignId);

  if (!existing) {
    throw new AppError("NOT_FOUND", "Campaign not found.");
  }

  if (existing.status !== "paused") {
    throw new AppError("VALIDATION_ERROR", "Only paused campaigns can be resumed.");
  }

  const updated = await updateCampaign(workspaceId, campaignId, { status: "active" });

  if (!updated) {
    throw new AppError("NOT_FOUND", "Campaign not found.");
  }

  await resumeEnrollmentsForCampaign(workspaceId, campaignId);

  await createAuditLog({
    workspaceId,
    actorId,
    action: "campaign.resumed",
    entityType: "campaign",
    entityId: updated.id,
    before: campaignSnapshot(existing),
    after: campaignSnapshot(updated),
  });

  return enrichCampaign(workspaceId, updated);
}

export async function archiveCampaignForWorkspace(
  workspaceId: string,
  actorId: string,
  campaignId: string,
): Promise<CampaignDetail> {
  const existing = await findCampaignById(workspaceId, campaignId);

  if (!existing) {
    throw new AppError("NOT_FOUND", "Campaign not found.");
  }

  const archived = await archiveCampaign(workspaceId, campaignId);

  if (!archived) {
    throw new AppError("NOT_FOUND", "Campaign not found.");
  }

  await pauseEnrollmentsForCampaign(workspaceId, campaignId);

  await createAuditLog({
    workspaceId,
    actorId,
    action: "campaign.archived",
    entityType: "campaign",
    entityId: archived.id,
    before: campaignSnapshot(existing),
    after: campaignSnapshot(archived),
  });

  return enrichCampaign(workspaceId, archived);
}

export function assertCampaignEditable(status: CampaignRecord["status"]): void {
  if (status !== "draft" && status !== "paused") {
    throw new AppError(
      "VALIDATION_ERROR",
      "Campaign steps can only be edited when the campaign is draft or paused.",
    );
  }
}
