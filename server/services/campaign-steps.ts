import "server-only";

import { createAuditLog } from "@/server/audit/create-audit-log";
import { AppError } from "@/server/errors";
import { findDocumentById } from "@/server/repositories/documents";
import {
  createCampaignStep,
  deleteCampaignStep,
  findCampaignStepById,
  findCampaignSteps,
  reorderCampaignSteps,
  updateCampaignStep,
  type CampaignStepRecord,
} from "@/server/repositories/campaign-steps";
import { findCampaignById } from "@/server/repositories/campaigns";
import {
  assertCampaignEditable,
} from "@/server/services/campaigns";
import type {
  CreateCampaignStepInput,
  ReorderCampaignStepsInput,
  UpdateCampaignStepInput,
} from "@/server/validation/campaign-steps";
import { stripHtmlToPlainText } from "@/lib/campaign-email";
import { assertCampaignStepReady } from "@/server/utils/campaign-step-readiness";

function stepSnapshot(step: CampaignStepRecord): Record<string, unknown> {
  return {
    id: step.id,
    campaignId: step.campaignId,
    order: step.order,
    delayDays: step.delayDays,
    sendTime: step.sendTime,
    fromName: step.fromName,
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
  const normalizedInput = normalizeStepContent(input);

  const step = await createCampaignStep(workspaceId, {
    campaignId,
    order: normalizedInput.order,
    name: normalizedInput.name,
    delayDays: normalizedInput.delayDays,
    delayAmount: normalizedInput.delayAmount,
    delayUnit: normalizedInput.delayUnit,
    sendTime: normalizedInput.sendTime,
    fromName: normalizedInput.fromName ?? campaign.senderName ?? campaign.defaultFromName,
    status: normalizedInput.status,
    contentMode: normalizedInput.contentMode,
    subject: normalizedInput.subject,
    previewText: normalizedInput.previewText,
    body: normalizedInput.body,
    bodyHtml: normalizedInput.bodyHtml,
    bodyText: normalizedInput.bodyText,
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

  const normalizedInput = normalizeStepContent(input);
  const mergedStep: CampaignStepRecord = {
    ...existing,
    ...normalizedInput,
    ...(documentIds !== undefined ? { documentIds } : {}),
  };

  if (normalizedInput.status === "ready") {
    assertCampaignStepReady(mergedStep);
  }

  const updated = await updateCampaignStep(workspaceId, campaignId, stepId, {
    ...(normalizedInput.order !== undefined ? { order: normalizedInput.order } : {}),
    ...(normalizedInput.name !== undefined ? { name: normalizedInput.name } : {}),
    ...(normalizedInput.delayDays !== undefined ? { delayDays: normalizedInput.delayDays } : {}),
    ...(normalizedInput.delayAmount !== undefined ? { delayAmount: normalizedInput.delayAmount } : {}),
    ...(normalizedInput.delayUnit !== undefined ? { delayUnit: normalizedInput.delayUnit } : {}),
    ...(normalizedInput.sendTime !== undefined ? { sendTime: normalizedInput.sendTime } : {}),
    ...(normalizedInput.fromName !== undefined ? { fromName: normalizedInput.fromName } : {}),
    ...(normalizedInput.status !== undefined ? { status: normalizedInput.status } : {}),
    ...(normalizedInput.contentMode !== undefined ? { contentMode: normalizedInput.contentMode } : {}),
    ...(normalizedInput.subject !== undefined ? { subject: normalizedInput.subject } : {}),
    ...(normalizedInput.previewText !== undefined ? { previewText: normalizedInput.previewText } : {}),
    ...(normalizedInput.body !== undefined ? { body: normalizedInput.body } : {}),
    ...(normalizedInput.bodyHtml !== undefined ? { bodyHtml: normalizedInput.bodyHtml } : {}),
    ...(normalizedInput.bodyText !== undefined ? { bodyText: normalizedInput.bodyText } : {}),
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

  if (existing.status !== "draft") {
    throw new AppError("VALIDATION_ERROR", "Only draft email steps can be deleted.");
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

export async function reorderCampaignStepsForWorkspace(
  workspaceId: string,
  actorId: string,
  campaignId: string,
  input: ReorderCampaignStepsInput,
): Promise<CampaignStepRecord[]> {
  const campaign = await findCampaignById(workspaceId, campaignId);

  if (!campaign) {
    throw new AppError("NOT_FOUND", "Campaign not found.");
  }

  assertCampaignEditable(campaign.status);

  const steps = await reorderCampaignSteps(workspaceId, campaignId, input.stepIds);

  await createAuditLog({
    workspaceId,
    actorId,
    action: "campaign_step.reordered",
    entityType: "campaign",
    entityId: campaignId,
    after: { stepIds: input.stepIds },
  });

  return steps;
}

export async function duplicateCampaignStepForWorkspace(
  workspaceId: string,
  actorId: string,
  campaignId: string,
  stepId: string,
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

  const allSteps = await findCampaignSteps(workspaceId, campaignId);
  const nextOrder = allSteps.length + 1;

  const duplicate = await createCampaignStep(workspaceId, {
    campaignId,
    order: nextOrder,
    name: `${existing.name ?? existing.subject} (copy)`,
    delayDays: existing.delayDays,
    delayAmount: existing.delayAmount ?? existing.delayDays,
    delayUnit: existing.delayUnit,
    sendTime: existing.sendTime,
    fromName: existing.fromName,
    status: "draft",
    contentMode: existing.contentMode,
    subject: existing.subject,
    previewText: existing.previewText,
    body: existing.body,
    bodyHtml: existing.bodyHtml,
    bodyText: existing.bodyText,
    documentIds: existing.documentIds,
  });

  await createAuditLog({
    workspaceId,
    actorId,
    action: "campaign_step.duplicated",
    entityType: "campaign_step",
    entityId: duplicate.id,
    after: stepSnapshot(duplicate),
  });

  return duplicate;
}

export function normalizeStepContent<T extends UpdateCampaignStepInput | CreateCampaignStepInput>(
  input: T,
): T {
  if (input.contentMode === "html" && input.bodyHtml && !input.bodyText) {
    return {
      ...input,
      bodyText: stripHtmlToPlainText(input.bodyHtml),
      body: stripHtmlToPlainText(input.bodyHtml),
    };
  }

  if (input.contentMode === "plain_text" && input.body && !input.bodyText) {
    return {
      ...input,
      bodyText: input.body,
    };
  }

  if (input.contentMode === "rich_text" && input.bodyHtml && !input.body) {
    return {
      ...input,
      body: stripHtmlToPlainText(input.bodyHtml),
      bodyText: stripHtmlToPlainText(input.bodyHtml),
    };
  }

  return input;
}
