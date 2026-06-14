import "server-only";

import { createAuditLog } from "@/server/audit/create-audit-log";
import { AppError } from "@/server/errors";
import { findDocumentById } from "@/server/repositories/documents";
import {
  createCampaignStep,
  deleteCampaignStep,
  findCampaignStepById,
  findCampaignSteps,
  updateCampaignStep,
  type CampaignStepRecord,
} from "@/server/repositories/campaign-steps";
import { findCampaignById } from "@/server/repositories/campaigns";
import {
  assertCampaignEditable,
} from "@/server/services/campaigns";
import type {
  CreateCampaignStepInput,
  UpdateCampaignStepInput,
} from "@/server/validation/campaign-steps";

function stepSnapshot(step: CampaignStepRecord): Record<string, unknown> {
  return {
    id: step.id,
    campaignId: step.campaignId,
    order: step.order,
    delayDays: step.delayDays,
    subject: step.subject,
    documentIds: step.documentIds,
  };
}

async function validateDocumentIds(
  workspaceId: string,
  documentIds: string[] | undefined,
): Promise<string[]> {
  if (!documentIds || documentIds.length === 0) {
    return [];
  }

  const validated: string[] = [];

  for (const documentId of documentIds) {
    const document = await findDocumentById(workspaceId, documentId);

    if (!document || document.status !== "active" || document.archivedAt) {
      throw new AppError(
        "VALIDATION_ERROR",
        "All documentIds must refer to active documents in this workspace.",
        { details: { documentId } },
      );
    }

    validated.push(documentId);
  }

  return validated;
}

export async function listCampaignStepsForWorkspace(
  workspaceId: string,
  campaignId: string,
): Promise<CampaignStepRecord[]> {
  const campaign = await findCampaignById(workspaceId, campaignId);

  if (!campaign) {
    throw new AppError("NOT_FOUND", "Campaign not found.");
  }

  return findCampaignSteps(workspaceId, campaignId);
}

export async function createCampaignStepForWorkspace(
  workspaceId: string,
  actorId: string,
  campaignId: string,
  input: CreateCampaignStepInput,
): Promise<CampaignStepRecord> {
  const campaign = await findCampaignById(workspaceId, campaignId);

  if (!campaign) {
    throw new AppError("NOT_FOUND", "Campaign not found.");
  }

  assertCampaignEditable(campaign.status);

  if (input.channel !== "email") {
    throw new AppError("VALIDATION_ERROR", "Only email channel is supported.");
  }

  const documentIds = await validateDocumentIds(workspaceId, input.documentIds);

  const step = await createCampaignStep(workspaceId, {
    campaignId,
    order: input.order,
    delayDays: input.delayDays,
    subject: input.subject,
    body: input.body,
    documentIds,
  });

  await createAuditLog({
    workspaceId,
    actorId,
    action: "campaign_step.created",
    entityType: "campaign_step",
    entityId: step.id,
    after: stepSnapshot(step),
  });

  return step;
}

export async function updateCampaignStepForWorkspace(
  workspaceId: string,
  actorId: string,
  campaignId: string,
  stepId: string,
  input: UpdateCampaignStepInput,
): Promise<CampaignStepRecord> {
  const campaign = await findCampaignById(workspaceId, campaignId);

  if (!campaign) {
    throw new AppError("NOT_FOUND", "Campaign not found.");
  }

  assertCampaignEditable(campaign.status);

  const existing = await findCampaignStepById(workspaceId, campaignId, stepId);

  if (!existing) {
    throw new AppError("NOT_FOUND", "Campaign step not found.");
  }

  const documentIds =
    input.documentIds !== undefined
      ? await validateDocumentIds(workspaceId, input.documentIds)
      : undefined;

  const updated = await updateCampaignStep(workspaceId, campaignId, stepId, {
    ...(input.order !== undefined ? { order: input.order } : {}),
    ...(input.delayDays !== undefined ? { delayDays: input.delayDays } : {}),
    ...(input.subject !== undefined ? { subject: input.subject } : {}),
    ...(input.body !== undefined ? { body: input.body } : {}),
    ...(documentIds !== undefined ? { documentIds } : {}),
  });

  if (!updated) {
    throw new AppError("NOT_FOUND", "Campaign step not found.");
  }

  await createAuditLog({
    workspaceId,
    actorId,
    action: "campaign_step.updated",
    entityType: "campaign_step",
    entityId: updated.id,
    before: stepSnapshot(existing),
    after: stepSnapshot(updated),
  });

  return updated;
}

export async function deleteCampaignStepForWorkspace(
  workspaceId: string,
  actorId: string,
  campaignId: string,
  stepId: string,
): Promise<void> {
  const campaign = await findCampaignById(workspaceId, campaignId);

  if (!campaign) {
    throw new AppError("NOT_FOUND", "Campaign not found.");
  }

  assertCampaignEditable(campaign.status);

  const existing = await findCampaignStepById(workspaceId, campaignId, stepId);

  if (!existing) {
    throw new AppError("NOT_FOUND", "Campaign step not found.");
  }

  const deleted = await deleteCampaignStep(workspaceId, campaignId, stepId);

  if (!deleted) {
    throw new AppError("NOT_FOUND", "Campaign step not found.");
  }

  await createAuditLog({
    workspaceId,
    actorId,
    action: "campaign_step.deleted",
    entityType: "campaign_step",
    entityId: stepId,
    before: stepSnapshot(existing),
  });
}
