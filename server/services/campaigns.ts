import "server-only";

import { createAuditLog } from "@/server/audit/create-audit-log";
import { AppError } from "@/server/errors";
import {
  archiveCampaign,
  createCampaign,
  deleteCampaignById,
  findCampaignById,
  findCampaigns,
  restoreCampaign,
  updateCampaign,
  type CampaignListFilter,
  type CampaignRecord,
  type EnrollmentRules,
} from "@/server/repositories/campaigns";
import {
  countCampaignEnrollments,
  cancelEnrollmentsForCampaign,
  pauseEnrollmentsForCampaign,
  resumeEnrollmentsForCampaign,
} from "@/server/repositories/campaign-enrollments";
import { countCampaignSteps, deleteCampaignStepsForCampaign } from "@/server/repositories/campaign-steps";
import { findDictionaryItemById } from "@/server/repositories/dictionary-items";
import { findProjectById } from "@/server/repositories/projects";
import { findTagById } from "@/server/repositories/tags";
import { findMembership } from "@/server/repositories/memberships";
import { rescheduleActiveEnrollmentSendsForCampaign } from "@/server/services/campaign-enrollments";
import { assertCampaignLaunchReady } from "@/server/services/campaign-readiness";
import { sendCampaignEnrollmentsImmediately } from "@/server/services/campaign-sending";
import type {
  CreateCampaignInput,
  UpdateCampaignInput,
} from "@/server/validation/campaigns";
import { validateOptionalAssignableMember } from "@/server/services/assignments";
import { assertValidProjectFilter, validateActiveProjectId } from "@/server/services/project-scope";
import { assertVerifiedSenderEmail } from "@/server/services/sending-domains";

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
    defaultFromName: campaign.defaultFromName,
    senderName: campaign.senderName,
    senderEmail: campaign.senderEmail,
    sendingDomainId: campaign.sendingDomainId,
    ownerId: campaign.ownerId,
  };
}

function mergeCampaignUpdate(
  existing: CampaignRecord,
  input: UpdateCampaignInput,
): CampaignRecord {
  return {
    ...existing,
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.projectIds !== undefined ? { projectIds: input.projectIds } : {}),
    ...(input.autoEnrollmentEnabled !== undefined
      ? { autoEnrollmentEnabled: input.autoEnrollmentEnabled }
      : {}),
    ...(input.enrollmentTrigger !== undefined
      ? { enrollmentTrigger: input.enrollmentTrigger }
      : {}),
    ...(input.enrollmentRules !== undefined ? { enrollmentRules: input.enrollmentRules } : {}),
    ...(input.frequency !== undefined ? { frequency: input.frequency } : {}),
    ...(input.defaultFromName !== undefined ? { defaultFromName: input.defaultFromName } : {}),
    ...(input.senderName !== undefined ? { senderName: input.senderName } : {}),
    ...(input.senderEmail !== undefined ? { senderEmail: input.senderEmail } : {}),
    ...(input.sendingDomainId !== undefined ? { sendingDomainId: input.sendingDomainId } : {}),
    ...(input.ownerId !== undefined ? { ownerId: input.ownerId } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
  };
}

async function validateCampaignSenderInput(
  workspaceId: string,
  input: Pick<UpdateCampaignInput, "senderEmail" | "sendingDomainId">,
): Promise<void> {
  const hasSenderEmail =
    input.senderEmail !== undefined && input.senderEmail !== null && input.senderEmail !== "";
  const hasSendingDomain =
    input.sendingDomainId !== undefined &&
    input.sendingDomainId !== null &&
    input.sendingDomainId !== "";

  if (hasSenderEmail !== hasSendingDomain) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Sender email and sending domain must be configured together.",
    );
  }

  if (hasSenderEmail && hasSendingDomain && input.senderEmail && input.sendingDomainId) {
    await assertVerifiedSenderEmail(workspaceId, input.sendingDomainId, input.senderEmail);
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
  await assertValidProjectFilter(workspaceId, filter.projectId);
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

async function validateCampaignProjectIds(
  workspaceId: string,
  projectIds: string[] | undefined,
): Promise<void> {
  if (!projectIds) {
    return;
  }

  for (const projectId of projectIds) {
    await validateActiveProjectId(workspaceId, projectId);
  }
}

function normalizeAutoEnrollmentInput<
  T extends {
    autoEnrollmentEnabled?: boolean;
    enrollmentTrigger?: CampaignRecord["enrollmentTrigger"];
  },
>(input: T): T {
  if (
    input.autoEnrollmentEnabled &&
    (!input.enrollmentTrigger || input.enrollmentTrigger === "manual_only")
  ) {
    return {
      ...input,
      enrollmentTrigger: "new_lead",
    };
  }

  return input;
}

function resolveEffectiveEnrollmentSettings(
  existing: Pick<CampaignRecord, "autoEnrollmentEnabled" | "enrollmentTrigger">,
  input: {
    autoEnrollmentEnabled?: boolean;
    enrollmentTrigger?: CampaignRecord["enrollmentTrigger"];
  },
): {
  autoEnrollmentEnabled: boolean;
  enrollmentTrigger: CampaignRecord["enrollmentTrigger"];
} {
  const normalized = normalizeAutoEnrollmentInput({
    autoEnrollmentEnabled: input.autoEnrollmentEnabled ?? existing.autoEnrollmentEnabled,
    enrollmentTrigger: input.enrollmentTrigger ?? existing.enrollmentTrigger,
  });

  return {
    autoEnrollmentEnabled: normalized.autoEnrollmentEnabled ?? existing.autoEnrollmentEnabled,
    enrollmentTrigger: normalized.enrollmentTrigger ?? existing.enrollmentTrigger,
  };
}

function validateAutoEnrollmentSettings(input: {
  autoEnrollmentEnabled?: boolean;
  enrollmentTrigger?: CampaignRecord["enrollmentTrigger"];
}): void {
  if (input.autoEnrollmentEnabled && input.enrollmentTrigger === "manual_only") {
    throw new AppError(
      "VALIDATION_ERROR",
      "Automatic enrollment requires a trigger of new_lead or lead_updated.",
    );
  }
}

async function validateEnrollmentRules(
  workspaceId: string,
  rules: EnrollmentRules | undefined,
): Promise<void> {
  if (!rules) {
    return;
  }

  for (const condition of rules.conditions) {
    if (condition.field === "projectId" && typeof condition.value === "string" && condition.value) {
      await validateActiveProjectId(workspaceId, condition.value);
    }

    if (condition.field === "sourceId" && typeof condition.value === "string" && condition.value) {
      const item = await findDictionaryItemById(workspaceId, condition.value);
      if (!item || item.type !== "lead_source") {
        throw new AppError("VALIDATION_ERROR", "Invalid lead source in enrollment rule.");
      }
    }

    if (condition.field === "statusId" && typeof condition.value === "string" && condition.value) {
      const item = await findDictionaryItemById(workspaceId, condition.value);
      if (!item || item.type !== "lead_status") {
        throw new AppError("VALIDATION_ERROR", "Invalid lead status in enrollment rule.");
      }
    }

    if (condition.field === "tags") {
      const tagIds = Array.isArray(condition.value)
        ? condition.value
        : typeof condition.value === "string" && condition.value
          ? [condition.value]
          : [];

      for (const tagId of tagIds) {
        const tag = await findTagById(workspaceId, tagId);
        if (!tag) {
          throw new AppError("VALIDATION_ERROR", "Invalid tag in enrollment rule.");
        }
      }
    }

    if (condition.field === "assignedTo" && typeof condition.value === "string" && condition.value) {
      const membership = await findMembership(workspaceId, condition.value);
      if (!membership || membership.status !== "active") {
        throw new AppError("VALIDATION_ERROR", "Invalid assigned user in enrollment rule.");
      }
    }

    if (condition.field === "customField") {
      const key =
        condition.customFieldKey?.trim() ||
        (typeof condition.value === "string" && condition.value.includes(":")
          ? condition.value.split(":")[0]?.trim()
          : typeof condition.value === "string"
            ? condition.value.trim()
            : "");

      if (
        condition.operator !== "is_empty" &&
        condition.operator !== "is_not_empty" &&
        !key
      ) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Custom field enrollment rules require a field key.",
        );
      }
    }
  }
}

export async function createCampaignForWorkspace(
  workspaceId: string,
  actorId: string,
  input: CreateCampaignInput,
): Promise<CampaignDetail> {
  const normalizedInput = normalizeAutoEnrollmentInput(input);
  validateAutoEnrollmentSettings(normalizedInput);

  await validateOptionalAssignableMember(workspaceId, normalizedInput.ownerId, "Owner");
  await validateCampaignProjectIds(workspaceId, normalizedInput.projectIds);
  await validateEnrollmentRules(workspaceId, normalizedInput.enrollmentRules);

  const campaign = await createCampaign(workspaceId, {
    name: normalizedInput.name,
    audienceType: normalizedInput.audienceType,
    projectIds: normalizedInput.projectIds ?? [],
    autoEnrollmentEnabled: normalizedInput.autoEnrollmentEnabled ?? false,
    enrollmentTrigger: normalizedInput.enrollmentTrigger ?? "manual_only",
    enrollmentRules: normalizedInput.enrollmentRules ?? { logic: "AND", conditions: [] },
    frequency: normalizedInput.frequency ?? null,
    defaultFromName: normalizedInput.defaultFromName ?? normalizedInput.senderName ?? null,
    senderName: normalizedInput.senderName ?? normalizedInput.defaultFromName ?? null,
    senderEmail: normalizedInput.senderEmail ?? null,
    sendingDomainId: normalizedInput.sendingDomainId ?? null,
    createdBy: actorId,
    ownerId: normalizedInput.ownerId ?? null,
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
  const normalizedInput = normalizeAutoEnrollmentInput(input);
  const existing = await findCampaignById(workspaceId, campaignId);

  if (!existing) {
    throw new AppError("NOT_FOUND", "Campaign not found.");
  }

  if (existing.status === "archived") {
    throw new AppError(
      "VALIDATION_ERROR",
      "Archived campaigns cannot be edited. Restore the campaign first.",
    );
  }

  if (normalizedInput.status) {
    assertAllowedStatusTransition(existing.status, normalizedInput.status);

    if (normalizedInput.status === "active") {
      const stepCount = await countCampaignSteps(workspaceId, campaignId);

      if (stepCount < 1) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Campaign must have at least one step before activation.",
        );
      }

      await assertCampaignLaunchReady(
        workspaceId,
        mergeCampaignUpdate(existing, normalizedInput),
      );
    }
  }

  if (normalizedInput.ownerId !== undefined) {
    await validateOptionalAssignableMember(workspaceId, normalizedInput.ownerId, "Owner");
  }

  await validateCampaignProjectIds(workspaceId, normalizedInput.projectIds);
  await validateEnrollmentRules(workspaceId, normalizedInput.enrollmentRules);
  await validateCampaignSenderInput(workspaceId, normalizedInput);

  const effectiveEnrollment = resolveEffectiveEnrollmentSettings(existing, normalizedInput);
  validateAutoEnrollmentSettings(effectiveEnrollment);

  const shouldPersistEnrollmentSettings =
    normalizedInput.autoEnrollmentEnabled !== undefined ||
    normalizedInput.enrollmentTrigger !== undefined ||
    effectiveEnrollment.autoEnrollmentEnabled !== existing.autoEnrollmentEnabled ||
    effectiveEnrollment.enrollmentTrigger !== existing.enrollmentTrigger;

  const updated = await updateCampaign(workspaceId, campaignId, {
    ...(normalizedInput.name !== undefined ? { name: normalizedInput.name } : {}),
    ...(normalizedInput.projectIds !== undefined
      ? { projectIds: normalizedInput.projectIds }
      : {}),
    ...(shouldPersistEnrollmentSettings
      ? {
          autoEnrollmentEnabled: effectiveEnrollment.autoEnrollmentEnabled,
          enrollmentTrigger: effectiveEnrollment.enrollmentTrigger,
        }
      : {}),
    ...(normalizedInput.enrollmentRules !== undefined
      ? { enrollmentRules: normalizedInput.enrollmentRules }
      : {}),
    ...(normalizedInput.frequency !== undefined ? { frequency: normalizedInput.frequency } : {}),
    ...(normalizedInput.defaultFromName !== undefined
      ? { defaultFromName: normalizedInput.defaultFromName }
      : {}),
    ...(normalizedInput.senderName !== undefined ? { senderName: normalizedInput.senderName } : {}),
    ...(normalizedInput.senderEmail !== undefined
      ? { senderEmail: normalizedInput.senderEmail }
      : {}),
    ...(normalizedInput.sendingDomainId !== undefined
      ? { sendingDomainId: normalizedInput.sendingDomainId }
      : {}),
    ...(normalizedInput.ownerId !== undefined ? { ownerId: normalizedInput.ownerId } : {}),
    ...(normalizedInput.status !== undefined ? { status: normalizedInput.status } : {}),
  });

  if (!updated) {
    throw new AppError("NOT_FOUND", "Campaign not found.");
  }

  if (normalizedInput.status === "paused" && existing.status === "active") {
    await pauseEnrollmentsForCampaign(workspaceId, campaignId);
  }

  if (normalizedInput.status === "active" && existing.status === "paused") {
    await resumeEnrollmentsForCampaign(workspaceId, campaignId);
    const anchor = new Date();
    const resumedEnrollmentIds = await rescheduleActiveEnrollmentSendsForCampaign(
      workspaceId,
      campaignId,
      anchor,
      "resume",
    );
    if (resumedEnrollmentIds.length > 0) {
      void sendCampaignEnrollmentsImmediately(
        workspaceId,
        campaignId,
        "resume",
        resumedEnrollmentIds,
      ).catch(() => undefined);
    }
  }

  if (normalizedInput.status === "active" && existing.status === "draft") {
    const anchor = new Date();
    const activatedEnrollmentIds = await rescheduleActiveEnrollmentSendsForCampaign(
      workspaceId,
      campaignId,
      anchor,
      "activation",
    );
    if (activatedEnrollmentIds.length > 0) {
      void sendCampaignEnrollmentsImmediately(
        workspaceId,
        campaignId,
        "activation",
        activatedEnrollmentIds,
      ).catch(() => undefined);
    }
  }

  const auditAction =
    normalizedInput.status === "paused" && existing.status === "active"
      ? "campaign.paused"
      : normalizedInput.status === "active" && existing.status === "paused"
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

  await assertCampaignLaunchReady(workspaceId, existing);

  const updated = await updateCampaign(workspaceId, campaignId, { status: "active" });

  if (!updated) {
    throw new AppError("NOT_FOUND", "Campaign not found.");
  }

  await resumeEnrollmentsForCampaign(workspaceId, campaignId);

  const anchor = new Date();
  const resumedEnrollmentIds = await rescheduleActiveEnrollmentSendsForCampaign(
    workspaceId,
    campaignId,
    anchor,
    "resume",
  );
  if (resumedEnrollmentIds.length > 0) {
    void sendCampaignEnrollmentsImmediately(
      workspaceId,
      campaignId,
      "resume",
      resumedEnrollmentIds,
    ).catch(() => undefined);
  }

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

  await cancelEnrollmentsForCampaign(
    workspaceId,
    campaignId,
    "Campaign archived.",
  );

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
  if (status === "archived") {
    throw new AppError(
      "VALIDATION_ERROR",
      "Archived campaigns cannot be edited. Restore the campaign first.",
    );
  }

  if (status !== "draft" && status !== "paused") {
    throw new AppError(
      "VALIDATION_ERROR",
      "Campaign steps can only be edited when the campaign is draft or paused.",
    );
  }
}

export async function restoreCampaignForWorkspace(
  workspaceId: string,
  actorId: string,
  campaignId: string,
): Promise<CampaignDetail> {
  const existing = await findCampaignById(workspaceId, campaignId);

  if (!existing) {
    throw new AppError("NOT_FOUND", "Campaign not found.");
  }

  if (existing.status !== "archived") {
    throw new AppError("VALIDATION_ERROR", "Only archived campaigns can be restored.");
  }

  const restored = await restoreCampaign(workspaceId, campaignId);

  if (!restored) {
    throw new AppError("NOT_FOUND", "Campaign not found.");
  }

  await createAuditLog({
    workspaceId,
    actorId,
    action: "campaign.restored",
    entityType: "campaign",
    entityId: restored.id,
    before: campaignSnapshot(existing),
    after: campaignSnapshot(restored),
  });

  return enrichCampaign(workspaceId, restored);
}

export async function purgeCampaignForWorkspace(
  workspaceId: string,
  actorId: string,
  campaignId: string,
): Promise<{ deleted: true }> {
  const existing = await findCampaignById(workspaceId, campaignId);

  if (!existing) {
    throw new AppError("NOT_FOUND", "Campaign not found.");
  }

  if (existing.status !== "draft") {
    throw new AppError(
      "VALIDATION_ERROR",
      "Only draft campaigns can be permanently deleted. Archive active campaigns instead.",
    );
  }

  const enrollmentCount = await countCampaignEnrollments(workspaceId, campaignId);

  if (enrollmentCount > 0) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Cannot delete a campaign with enrollments. Archive it instead.",
    );
  }

  await deleteCampaignStepsForCampaign(workspaceId, campaignId);
  const deleted = await deleteCampaignById(workspaceId, campaignId);

  if (!deleted) {
    throw new AppError("NOT_FOUND", "Campaign not found.");
  }

  await createAuditLog({
    workspaceId,
    actorId,
    action: "campaign.deleted",
    entityType: "campaign",
    entityId: campaignId,
    before: campaignSnapshot(existing),
  });

  return { deleted: true };
}
