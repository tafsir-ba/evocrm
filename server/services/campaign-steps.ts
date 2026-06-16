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
import { findCampaignById, type CampaignRecord } from "@/server/repositories/campaigns";
import { assertCampaignEditable } from "@/server/services/campaigns";
import { rescheduleEnrollmentsForCampaignSchedule } from "@/server/services/campaign-enrollments";
import type {
  CreateCampaignStepInput,
  ReorderCampaignStepsInput,
  UpdateCampaignStepInput,
} from "@/server/validation/campaign-steps";
import { normalizeCampaignVariableTokens, stripHtmlToPlainText } from "@/lib/campaign-email";
import { assertCampaignStepReady } from "@/server/utils/campaign-step-readiness";

function stepContentMeaningfullyChanged(
  existing: CampaignStepRecord,
  merged: CampaignStepRecord,
): boolean {
  return (
    existing.subject !== merged.subject ||
    existing.body !== merged.body ||
    existing.bodyHtml !== merged.bodyHtml ||
    existing.bodyText !== merged.bodyText ||
    existing.contentMode !== merged.contentMode
  );
}

function shouldAssertStepReadiness(
  existing: CampaignStepRecord,
  normalizedInput: UpdateCampaignStepInput,
  mergedStep: CampaignStepRecord,
): boolean {
  if (normalizedInput.status === "ready") {
    return true;
  }

  const resultingStatus = normalizedInput.status ?? existing.status;

  return (
    (resultingStatus === "ready" || resultingStatus === "active") &&
    stepContentMeaningfullyChanged(existing, mergedStep)
  );
}

function buildStepRecordForReadinessCheck(
  workspaceId: string,
  campaignId: string,
  input: CreateCampaignStepInput,
): CampaignStepRecord {
  return {
    id: "pending",
    workspaceId,
    campaignId,
    order: input.order,
    name: input.name ?? null,
    delayDays: input.delayDays,
    delayAmount: input.delayAmount ?? input.delayDays,
    delayUnit: input.delayUnit ?? "days",
    sendTime: input.sendTime,
    fromName: input.fromName ?? null,
    channel: "email",
    status: "ready",
    contentMode: input.contentMode ?? "plain_text",
    subject: input.subject ?? "",
    previewText: input.previewText ?? null,
    body: input.body ?? "",
    bodyHtml: input.bodyHtml ?? null,
    bodyText: input.bodyText ?? null,
    documentIds: input.documentIds ?? [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function stepContentFieldsChanged(
  existing: CampaignStepRecord,
  input: UpdateCampaignStepInput,
): boolean {
  if (input.order !== undefined && input.order !== existing.order) {
    return true;
  }

  if (input.status !== undefined && input.status !== existing.status) {
    return true;
  }

  if (input.contentMode !== undefined && input.contentMode !== existing.contentMode) {
    return true;
  }

  if (input.subject !== undefined && input.subject !== existing.subject) {
    return true;
  }

  if (input.previewText !== undefined && input.previewText !== existing.previewText) {
    return true;
  }

  if (input.body !== undefined && input.body !== existing.body) {
    return true;
  }

  if (input.bodyHtml !== undefined && input.bodyHtml !== existing.bodyHtml) {
    return true;
  }

  if (input.bodyText !== undefined && input.bodyText !== existing.bodyText) {
    return true;
  }

  if (input.fromName !== undefined && input.fromName !== existing.fromName) {
    return true;
  }

  if (
    input.documentIds !== undefined &&
    JSON.stringify(input.documentIds) !== JSON.stringify(existing.documentIds)
  ) {
    return true;
  }

  return false;
}

function scheduleFieldsChanged(
  existing: CampaignStepRecord,
  input: UpdateCampaignStepInput,
): boolean {
  return (
    (input.sendTime !== undefined && input.sendTime !== existing.sendTime) ||
    (input.delayDays !== undefined && input.delayDays !== existing.delayDays) ||
    (input.delayAmount !== undefined && input.delayAmount !== existing.delayAmount) ||
    (input.delayUnit !== undefined && input.delayUnit !== existing.delayUnit)
  );
}

function pickActiveCampaignScheduleUpdate(
  input: UpdateCampaignStepInput,
): UpdateCampaignStepInput {
  return {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.sendTime !== undefined ? { sendTime: input.sendTime } : {}),
    ...(input.delayDays !== undefined ? { delayDays: input.delayDays } : {}),
    ...(input.delayAmount !== undefined ? { delayAmount: input.delayAmount } : {}),
    ...(input.delayUnit !== undefined ? { delayUnit: input.delayUnit } : {}),
  };
}

function assertCampaignStepUpdateAllowed(
  campaignStatus: CampaignRecord["status"],
  existing: CampaignStepRecord,
  input: UpdateCampaignStepInput,
): void {
  if (campaignStatus === "archived") {
    throw new AppError(
      "VALIDATION_ERROR",
      "Archived campaigns cannot be edited. Restore the campaign first.",
    );
  }

  if (campaignStatus === "draft" || campaignStatus === "paused") {
    return;
  }

  if (campaignStatus === "active" && stepContentFieldsChanged(existing, input)) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Pause this campaign to edit email content. You can still update send time and delay while the campaign is active.",
    );
  }
}

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

  if (normalizedInput.status === "ready") {
    assertCampaignStepReady(
      buildStepRecordForReadinessCheck(workspaceId, campaignId, normalizedInput),
    );
  }

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

  const existing = await findCampaignStepById(workspaceId, campaignId, stepId);

  if (!existing) {
    throw new AppError("NOT_FOUND", "Campaign step not found.");
  }

  assertCampaignStepUpdateAllowed(campaign.status, existing, input);

  const scopedInput =
    campaign.status === "active" ? pickActiveCampaignScheduleUpdate(input) : input;

  const documentIds =
    scopedInput.documentIds !== undefined
      ? await validateDocumentIds(workspaceId, scopedInput.documentIds)
      : undefined;

  const normalizedInput = normalizeStepContent(scopedInput);
  const mergedStep: CampaignStepRecord = {
    ...existing,
    ...normalizedInput,
    ...(documentIds !== undefined ? { documentIds } : {}),
  };

  if (shouldAssertStepReadiness(existing, normalizedInput, mergedStep)) {
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

  if (scheduleFieldsChanged(existing, normalizedInput)) {
    await rescheduleEnrollmentsForCampaignSchedule(workspaceId, campaignId);
  }

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
  const normalizedInput = {
    ...input,
    ...(input.body !== undefined ? { body: normalizeCampaignVariableTokens(input.body) } : {}),
    ...(input.bodyHtml !== undefined && input.bodyHtml !== null
      ? { bodyHtml: normalizeCampaignVariableTokens(input.bodyHtml) }
      : {}),
    ...(input.bodyText !== undefined && input.bodyText !== null
      ? { bodyText: normalizeCampaignVariableTokens(input.bodyText) }
      : {}),
    ...(input.subject !== undefined
      ? { subject: normalizeCampaignVariableTokens(input.subject) }
      : {}),
    ...(input.previewText !== undefined && input.previewText !== null
      ? { previewText: normalizeCampaignVariableTokens(input.previewText) }
      : {}),
  } as T;

  if (normalizedInput.contentMode === "html" && normalizedInput.bodyHtml && !normalizedInput.bodyText) {
    return {
      ...normalizedInput,
      bodyText: stripHtmlToPlainText(normalizedInput.bodyHtml),
      body: stripHtmlToPlainText(normalizedInput.bodyHtml),
    };
  }

  if (normalizedInput.contentMode === "plain_text" && normalizedInput.body && !normalizedInput.bodyText) {
    return {
      ...normalizedInput,
      bodyText: normalizedInput.body,
    };
  }

  if (normalizedInput.contentMode === "rich_text" && normalizedInput.bodyHtml && !normalizedInput.body) {
    return {
      ...normalizedInput,
      body: stripHtmlToPlainText(normalizedInput.bodyHtml),
      bodyText: stripHtmlToPlainText(normalizedInput.bodyHtml),
    };
  }

  return normalizedInput;
}
