import "server-only";

import { createAuditLog } from "@/server/audit/create-audit-log";
import { AppError } from "@/server/errors";
import { DEFAULT_CAMPAIGN_STEP_SEND_TIME } from "@/lib/campaign-defaults";
import {
  applyCampaignVariables,
  buildCampaignEmailPlainText,
  CAMPAIGN_EMAIL_PREVIEW_CONTEXT,
  validateCampaignHtml,
} from "@/lib/campaign-email";
import { fromDatetimeLocalInWorkspaceTimezone } from "@/lib/workspace-datetime";
import {
  cancelEnrollmentsForCampaign,
  createCampaignEnrollmentsBulk,
  type CreateEnrollmentInput,
} from "@/server/repositories/campaign-enrollments";
import {
  findCampaignById,
  updateCampaign,
  type CampaignRecord,
} from "@/server/repositories/campaigns";
import { countCampaignSendsForCampaign } from "@/server/repositories/campaign-sends";
import {
  countCampaignSteps,
  createCampaignStep,
  findCampaignSteps,
  findFirstCampaignStep,
  updateCampaignStep,
} from "@/server/repositories/campaign-steps";
import {
  findNewsletterAudienceSegments,
  replaceNewsletterAudienceSegments,
  type NewsletterAudienceSegmentRecord,
  type UpsertNewsletterAudienceSegmentInput,
} from "@/server/repositories/newsletter-audience-segments";
import { findImportJobById } from "@/server/repositories/import-jobs";
import { findTagById } from "@/server/repositories/tags";
import { findWorkspaceById } from "@/server/repositories/workspaces";
import {
  assertMultiProjectRecordAccess,
} from "@/server/services/apply-project-scope";
import { assertCampaignLaunchReady } from "@/server/services/campaign-readiness";
import { sendCampaignEnrollmentsImmediately } from "@/server/services/campaign-sending";
import {
  assertNewsletterAudienceSendable,
  resolveNewsletterAudience,
} from "@/server/services/newsletter-audience";
import {
  enrichCampaign,
  type CampaignDetail,
} from "@/server/services/campaigns";
import { createImportJobForWorkspace } from "@/server/services/imports";
import { validateActiveProjectId } from "@/server/services/project-scope";
import { assertVerifiedSenderEmail } from "@/server/services/sending-domains";
import { assertNewsletterTestSendRateLimit } from "@/server/security/newsletter-test-send-rate-limit";
import { buildCampaignEmailHtml, sendCampaignEmail } from "@/server/email/resend";
import { resolveCampaignStepFromName } from "@/server/utils/campaign-from-name";
import type {
  NewsletterAudienceSegmentsInput,
  NewsletterScheduleInput,
} from "@/server/validation/newsletters";
import { MAX_IMPORT_FILE_SIZE_BYTES } from "@/lib/imports";

function assertIsNewsletter(campaign: CampaignRecord): void {
  if (campaign.kind !== "newsletter") {
    throw new AppError("VALIDATION_ERROR", "This campaign is not a newsletter.");
  }
}

export async function hasNewsletterSendStarted(
  workspaceId: string,
  campaignId: string,
): Promise<boolean> {
  const sendCount = await countCampaignSendsForCampaign(workspaceId, campaignId);
  return sendCount > 0;
}

export async function assertNewsletterMutableBeforeSend(
  workspaceId: string,
  campaign: CampaignRecord,
): Promise<void> {
  assertIsNewsletter(campaign);

  if (campaign.status === "archived") {
    throw new AppError(
      "VALIDATION_ERROR",
      "Archived newsletters cannot be edited. Restore the newsletter first.",
    );
  }

  if (campaign.audienceLockedAt) {
    const started = await hasNewsletterSendStarted(workspaceId, campaign.id);
    if (started) {
      throw new AppError(
        "VALIDATION_ERROR",
        "This newsletter has started sending and can no longer be edited or cancelled.",
      );
    }
  }
}

async function ensureSingleNewsletterStep(
  workspaceId: string,
  campaign: CampaignRecord,
  content?: {
    subject?: string;
    previewText?: string | null;
    bodyHtml?: string | null;
    bodyText?: string | null;
    fromName?: string | null;
    status?: "draft" | "ready";
  },
): Promise<void> {
  const steps = await findCampaignSteps(workspaceId, campaign.id);

  if (steps.length > 1) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Newsletters may only have a single email step.",
    );
  }

  if (steps.length === 1) {
    if (!content) {
      return;
    }

    await updateCampaignStep(workspaceId, campaign.id, steps[0].id, {
      ...(content.subject !== undefined ? { subject: content.subject } : {}),
      ...(content.previewText !== undefined
        ? { previewText: content.previewText }
        : {}),
      ...(content.bodyHtml !== undefined ? { bodyHtml: content.bodyHtml } : {}),
      ...(content.bodyText !== undefined ? { bodyText: content.bodyText } : {}),
      ...(content.fromName !== undefined ? { fromName: content.fromName } : {}),
      ...(content.status !== undefined ? { status: content.status } : {}),
      contentMode: "html",
      delayDays: 0,
      delayAmount: 0,
      delayUnit: "days",
      sendTime: DEFAULT_CAMPAIGN_STEP_SEND_TIME,
    });
    return;
  }

  await createCampaignStep(workspaceId, {
    campaignId: campaign.id,
    order: 1,
    name: content?.subject ?? campaign.name,
    delayDays: 0,
    delayAmount: 0,
    delayUnit: "days",
    sendTime: DEFAULT_CAMPAIGN_STEP_SEND_TIME,
    fromName:
      content?.fromName ?? campaign.senderName ?? campaign.defaultFromName,
    status: content?.status ?? "draft",
    contentMode: "html",
    subject: content?.subject ?? "",
    previewText: content?.previewText ?? null,
    body: content?.bodyText ?? "",
    bodyHtml: content?.bodyHtml ?? null,
    bodyText: content?.bodyText ?? null,
    documentIds: [],
  });
}

export async function listNewsletterSegmentsForWorkspace(
  workspaceId: string,
  campaignId: string,
  userId?: string,
): Promise<NewsletterAudienceSegmentRecord[]> {
  const campaign = await findCampaignById(workspaceId, campaignId);
  if (!campaign) {
    throw new AppError("NOT_FOUND", "Newsletter not found.");
  }
  assertIsNewsletter(campaign);
  await assertMultiProjectRecordAccess(
    workspaceId,
    userId,
    campaign.projectIds,
    "campaign:read",
  );

  return findNewsletterAudienceSegments(workspaceId, campaignId);
}

export async function replaceNewsletterSegmentsForWorkspace(
  workspaceId: string,
  actorId: string,
  campaignId: string,
  input: NewsletterAudienceSegmentsInput,
): Promise<NewsletterAudienceSegmentRecord[]> {
  const campaign = await findCampaignById(workspaceId, campaignId);
  if (!campaign) {
    throw new AppError("NOT_FOUND", "Newsletter not found.");
  }
  assertIsNewsletter(campaign);
  await assertNewsletterMutableBeforeSend(workspaceId, campaign);
  await assertMultiProjectRecordAccess(
    workspaceId,
    actorId,
    campaign.projectIds,
    "campaign:update",
  );

  if (campaign.audienceLockedAt) {
    // Editable until send starts: re-check immediately before unlock/cancel so a
    // concurrent send tick cannot race past the earlier mutable gate.
    await assertNewsletterSendNotStarted(
      workspaceId,
      campaignId,
      "This newsletter has already started sending and can no longer be edited.",
    );
    await updateCampaign(workspaceId, campaignId, {
      audienceLockedAt: null,
      audienceSummary: null,
      scheduledFor: null,
      status: campaign.status === "active" ? "draft" : campaign.status,
    });
    await cancelEnrollmentsForCampaign(
      workspaceId,
      campaignId,
      "Newsletter audience changed before send.",
    );
  }

  for (const segment of input.segments) {
    await validateActiveProjectId(workspaceId, segment.projectId);

    if (segment.type === "project_tags") {
      for (const tagId of segment.tagIds) {
        const tag = await findTagById(workspaceId, tagId);
        if (!tag) {
          throw new AppError("VALIDATION_ERROR", "Invalid tag in newsletter audience.");
        }
      }
      continue;
    }

    const importJob = await findImportJobById(workspaceId, segment.importJobId, {
      includeRowResults: true,
    });
    if (!importJob) {
      throw new AppError("VALIDATION_ERROR", "CSV import job not found for newsletter segment.");
    }
    if (importJob.entityType !== "lead") {
      throw new AppError("VALIDATION_ERROR", "Newsletter CSV segments require a lead import.");
    }
    if (
      importJob.status !== "completed" &&
      importJob.status !== "completed_with_errors"
    ) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Finish the CSV import before attaching it as a newsletter audience segment.",
      );
    }
    if (importJob.newsletterCampaignId !== campaignId) {
      throw new AppError(
        "VALIDATION_ERROR",
        "CSV segments must use an import started from this newsletter (drip enrollment stays disabled).",
      );
    }
    if (importJob.defaults.projectId && importJob.defaults.projectId !== segment.projectId) {
      throw new AppError(
        "VALIDATION_ERROR",
        "CSV segment project must match the import’s target project.",
      );
    }

    if (segment.applyTagId) {
      const tag = await findTagById(workspaceId, segment.applyTagId);
      if (!tag || tag.archivedAt || !tag.entityTypes.includes("lead")) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Invalid list tag for newsletter CSV segment.",
        );
      }
    }
  }

  const projectIds = [...new Set(input.segments.map((segment) => segment.projectId))];
  await updateCampaign(workspaceId, campaignId, { projectIds });

  const upsertInputs: UpsertNewsletterAudienceSegmentInput[] = input.segments.map(
    (segment, index) => {
      if (segment.type === "csv_import") {
        return {
          type: "csv_import" as const,
          order: segment.order ?? index + 1,
          projectId: segment.projectId,
          importJobId: segment.importJobId,
          applyTagId: segment.applyTagId ?? null,
        };
      }

      return {
        type: "project_tags" as const,
        order: segment.order ?? index + 1,
        projectId: segment.projectId,
        tagIds: segment.tagIds,
        tagMatch: segment.tagMatch,
      };
    },
  );

  const segments = await replaceNewsletterAudienceSegments(
    workspaceId,
    campaignId,
    upsertInputs,
  );

  await createAuditLog({
    workspaceId,
    actorId,
    action: "newsletter.audience_updated",
    entityType: "campaign",
    entityId: campaignId,
    after: {
      segmentCount: segments.length,
      projectIds,
      segmentTypes: segments.map((segment) => segment.type),
    },
  });

  return segments;
}

export async function createNewsletterAudienceImportForWorkspace(input: {
  workspaceId: string;
  actorId: string;
  campaignId: string;
  targetProjectId: string;
  applyTagId?: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  fileData: Buffer;
}) {
  const campaign = await findCampaignById(input.workspaceId, input.campaignId);
  if (!campaign) {
    throw new AppError("NOT_FOUND", "Newsletter not found.");
  }
  assertIsNewsletter(campaign);
  await assertNewsletterMutableBeforeSend(input.workspaceId, campaign);
  await assertMultiProjectRecordAccess(
    input.workspaceId,
    input.actorId,
    [...new Set([...campaign.projectIds, input.targetProjectId])],
    "campaign:update",
  );

  await validateActiveProjectId(input.workspaceId, input.targetProjectId);

  if (input.applyTagId) {
    const tag = await findTagById(input.workspaceId, input.applyTagId);
    if (!tag || tag.archivedAt || !tag.entityTypes.includes("lead")) {
      throw new AppError("VALIDATION_ERROR", "Invalid list tag for newsletter import.");
    }
  }

  if (input.fileSize > MAX_IMPORT_FILE_SIZE_BYTES) {
    throw new AppError("VALIDATION_ERROR", "Import file is too large.");
  }

  const defaults: Record<string, string> = {
    projectId: input.targetProjectId,
  };
  if (input.applyTagId) {
    defaults.tags = input.applyTagId;
  }

  const parsed = await createImportJobForWorkspace({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    entityType: "lead",
    fileName: input.fileName,
    fileSize: input.fileSize,
    mimeType: input.mimeType,
    fileData: input.fileData,
    newsletterCampaignId: input.campaignId,
    defaults,
  });

  await createAuditLog({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: "newsletter.audience_import_started",
    entityType: "campaign",
    entityId: input.campaignId,
    after: {
      importJobId: parsed.job.id,
      targetProjectId: input.targetProjectId,
      applyTagId: input.applyTagId ?? null,
      dripCampaignEvaluationEnabled: false,
    },
  });

  return {
    ...parsed,
    newsletter: {
      campaignId: input.campaignId,
      targetProjectId: input.targetProjectId,
      applyTagId: input.applyTagId ?? null,
      dripCampaignEvaluationEnabled: false,
    },
  };
}

export async function previewNewsletterAudienceForWorkspace(
  workspaceId: string,
  campaignId: string,
  userId?: string,
  query: {
    exclusionPage?: number;
    exclusionPageSize?: number;
  } = {},
) {
  const campaign = await findCampaignById(workspaceId, campaignId);
  if (!campaign) {
    throw new AppError("NOT_FOUND", "Newsletter not found.");
  }
  assertIsNewsletter(campaign);
  await assertMultiProjectRecordAccess(
    workspaceId,
    userId,
    campaign.projectIds,
    "campaign:read",
  );

  const result = await resolveNewsletterAudience(workspaceId, campaignId);
  const exclusionPage = query.exclusionPage ?? 1;
  const exclusionPageSize = query.exclusionPageSize ?? 25;
  const exclusionStart = (exclusionPage - 1) * exclusionPageSize;
  const exclusionEnd = exclusionStart + exclusionPageSize;

  return {
    summary: result.summary,
    unknownConsentPolicy: result.unknownConsentPolicy,
    includedSample: result.included.slice(0, 25),
    flaggedUnknownConsentSample: result.flaggedUnknownConsent.slice(0, 25),
    exclusionSample: result.exclusions.slice(exclusionStart, exclusionEnd),
    exclusions: {
      items: result.exclusions.slice(exclusionStart, exclusionEnd),
      total: result.exclusions.length,
      page: exclusionPage,
      pageSize: exclusionPageSize,
      totalPages: Math.max(1, Math.ceil(result.exclusions.length / exclusionPageSize)),
    },
    flaggedUnknownConsent: {
      items: result.flaggedUnknownConsent.slice(0, 50),
      total: result.flaggedUnknownConsent.length,
    },
    exclusionCounts: {
      missingEmail: result.summary.excludedMissingEmail,
      unsubscribed: result.summary.excludedUnsubscribed,
      suppressed: result.summary.excludedSuppressed,
      invalid: result.summary.excludedInvalid,
      archived: result.summary.excludedArchived,
      unknownConsent: result.summary.excludedUnknownConsent,
      deduped: result.summary.deduped,
    },
    importSummaries: result.importSummaries,
  };
}

export function buildNewsletterAudienceExclusionsCsv(
  result: Awaited<ReturnType<typeof resolveNewsletterAudience>>,
): string {
  const header = "type,reason,fullName,email,leadId";
  const exclusionRows = result.exclusions.map((row) =>
    [
      "excluded",
      row.reason,
      csvEscape(row.fullName),
      csvEscape(row.email ?? ""),
      row.leadId,
    ].join(","),
  );
  const flaggedRows = result.flaggedUnknownConsent.map((row) =>
    [
      "flagged_unknown_consent",
      "unknown_consent",
      csvEscape(row.fullName),
      csvEscape(row.email),
      row.leadId,
    ].join(","),
  );
  return [header, ...exclusionRows, ...flaggedRows].join("\n");
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function exportNewsletterAudienceExclusionsCsvForWorkspace(
  workspaceId: string,
  campaignId: string,
  userId?: string,
): Promise<string> {
  const campaign = await findCampaignById(workspaceId, campaignId);
  if (!campaign) {
    throw new AppError("NOT_FOUND", "Newsletter not found.");
  }
  assertIsNewsletter(campaign);
  await assertMultiProjectRecordAccess(
    workspaceId,
    userId,
    campaign.projectIds,
    "campaign:read",
  );

  const result = await resolveNewsletterAudience(workspaceId, campaignId);
  return buildNewsletterAudienceExclusionsCsv(result);
}

async function assertNewsletterSendNotStarted(
  workspaceId: string,
  campaignId: string,
  message: string,
): Promise<void> {
  if (await hasNewsletterSendStarted(workspaceId, campaignId)) {
    throw new AppError("VALIDATION_ERROR", message);
  }
}

async function lockAndActivateNewsletter(input: {
  workspaceId: string;
  actorId: string;
  campaignId: string;
  scheduledFor: Date;
  sendImmediately: boolean;
}): Promise<CampaignDetail> {
  const { workspaceId, actorId, campaignId, scheduledFor, sendImmediately } = input;

  const campaign = await findCampaignById(workspaceId, campaignId);
  if (!campaign) {
    throw new AppError("NOT_FOUND", "Newsletter not found.");
  }
  assertIsNewsletter(campaign);
  await assertMultiProjectRecordAccess(
    workspaceId,
    actorId,
    campaign.projectIds,
    "campaign:update",
  );

  if (campaign.status === "archived") {
    throw new AppError("VALIDATION_ERROR", "Archived newsletters cannot be sent.");
  }

  if (campaign.audienceLockedAt) {
    await assertNewsletterSendNotStarted(
      workspaceId,
      campaignId,
      "This newsletter has already started sending.",
    );
  }

  if (campaign.audienceType !== "leads") {
    throw new AppError("VALIDATION_ERROR", "Newsletters only support lead audiences.");
  }

  if (campaign.autoEnrollmentEnabled) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Newsletters cannot use automatic enrollment.",
    );
  }

  const stepCount = await countCampaignSteps(workspaceId, campaignId);
  if (stepCount !== 1) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Newsletters require exactly one email step before sending.",
    );
  }

  await assertCampaignLaunchReady(workspaceId, campaign);

  const audience = await resolveNewsletterAudience(workspaceId, campaignId);
  assertNewsletterAudienceSendable(audience);

  const firstStep = await findFirstCampaignStep(workspaceId, campaignId);
  if (!firstStep) {
    throw new AppError("VALIDATION_ERROR", "Newsletter is missing its email step.");
  }

  // Final TOCTOU guard immediately before mutating enrollments / lock state.
  await assertNewsletterSendNotStarted(
    workspaceId,
    campaignId,
    "This newsletter has already started sending.",
  );

  if (campaign.audienceLockedAt) {
    await cancelEnrollmentsForCampaign(
      workspaceId,
      campaignId,
      "Newsletter audience re-locked before send.",
    );
  }

  const lockedAt = new Date();
  const enrollmentInputs: CreateEnrollmentInput[] = audience.included.map(
    (recipient) => ({
      campaignId,
      leadId: recipient.leadId,
      projectId: recipient.projectId,
      enrollmentSource: "manual" as const,
      enrollmentReason: {
        newsletter: true,
        segmentIds: recipient.segmentIds,
        snapshotAt: lockedAt.toISOString(),
      },
      currentStep: firstStep.order,
      nextSendAt: scheduledFor,
    }),
  );

  // Insert in batches to avoid huge single writes.
  const BATCH = 500;
  for (let index = 0; index < enrollmentInputs.length; index += BATCH) {
    await createCampaignEnrollmentsBulk(
      workspaceId,
      enrollmentInputs.slice(index, index + BATCH),
    );
  }

  const updated = await updateCampaign(workspaceId, campaignId, {
    status: "active",
    scheduledFor,
    audienceLockedAt: lockedAt,
    audienceSummary: audience.summary,
    autoEnrollmentEnabled: false,
    enrollmentTrigger: "manual_only",
  });

  if (!updated) {
    throw new AppError("NOT_FOUND", "Newsletter not found.");
  }

  await createAuditLog({
    workspaceId,
    actorId,
    action: sendImmediately ? "newsletter.sent" : "newsletter.scheduled",
    entityType: "campaign",
    entityId: campaignId,
    after: {
      scheduledFor: scheduledFor.toISOString(),
      audienceLockedAt: lockedAt.toISOString(),
      audienceSummary: audience.summary,
    },
  });

  await createAuditLog({
    workspaceId,
    actorId,
    action: "newsletter.audience_locked",
    entityType: "campaign",
    entityId: campaignId,
    after: { audienceSummary: audience.summary },
  });

  if (sendImmediately || scheduledFor.getTime() <= Date.now()) {
    void sendCampaignEnrollmentsImmediately(
      workspaceId,
      campaignId,
      "activation",
    ).catch(() => undefined);
  }

  return enrichCampaign(workspaceId, updated);
}

export async function scheduleNewsletterForWorkspace(
  workspaceId: string,
  actorId: string,
  campaignId: string,
  input: NewsletterScheduleInput,
): Promise<CampaignDetail> {
  const workspace = await findWorkspaceById(workspaceId);
  if (!workspace) {
    throw new AppError("NOT_FOUND", "Workspace not found.");
  }

  const iso = fromDatetimeLocalInWorkspaceTimezone(
    input.scheduledForLocal,
    workspace.timezone,
  );

  if (!iso) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Invalid schedule time. Use a valid date and time in the workspace timezone.",
    );
  }

  const scheduledFor = new Date(iso);
  if (Number.isNaN(scheduledFor.getTime())) {
    throw new AppError("VALIDATION_ERROR", "Invalid schedule time.");
  }

  if (scheduledFor.getTime() <= Date.now() - 60_000) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Scheduled send time must be in the future.",
    );
  }

  return lockAndActivateNewsletter({
    workspaceId,
    actorId,
    campaignId,
    scheduledFor,
    sendImmediately: false,
  });
}

export async function sendNewsletterNowForWorkspace(
  workspaceId: string,
  actorId: string,
  campaignId: string,
): Promise<CampaignDetail> {
  return lockAndActivateNewsletter({
    workspaceId,
    actorId,
    campaignId,
    scheduledFor: new Date(),
    sendImmediately: true,
  });
}

export async function cancelNewsletterScheduleForWorkspace(
  workspaceId: string,
  actorId: string,
  campaignId: string,
): Promise<CampaignDetail> {
  const campaign = await findCampaignById(workspaceId, campaignId);
  if (!campaign) {
    throw new AppError("NOT_FOUND", "Newsletter not found.");
  }
  assertIsNewsletter(campaign);
  await assertMultiProjectRecordAccess(
    workspaceId,
    actorId,
    campaign.projectIds,
    "campaign:update",
  );
  await assertNewsletterMutableBeforeSend(workspaceId, campaign);

  if (!campaign.audienceLockedAt && campaign.status === "draft") {
    throw new AppError(
      "VALIDATION_ERROR",
      "This newsletter is not scheduled.",
    );
  }

  // Re-check immediately before canceling enrollments (TOCTOU guard).
  await assertNewsletterSendNotStarted(
    workspaceId,
    campaignId,
    "This newsletter has started sending and can no longer be cancelled.",
  );

  await cancelEnrollmentsForCampaign(
    workspaceId,
    campaignId,
    "Newsletter schedule cancelled before send.",
  );

  const updated = await updateCampaign(workspaceId, campaignId, {
    status: "draft",
    scheduledFor: null,
    audienceLockedAt: null,
    audienceSummary: null,
  });

  if (!updated) {
    throw new AppError("NOT_FOUND", "Newsletter not found.");
  }

  await createAuditLog({
    workspaceId,
    actorId,
    action: "newsletter.schedule_cancelled",
    entityType: "campaign",
    entityId: campaignId,
    before: {
      status: campaign.status,
      scheduledFor: campaign.scheduledFor,
      audienceLockedAt: campaign.audienceLockedAt,
    },
    after: {
      status: updated.status,
      scheduledFor: null,
      audienceLockedAt: null,
    },
  });

  return enrichCampaign(workspaceId, updated);
}

export async function upsertNewsletterContentStep(
  workspaceId: string,
  campaign: CampaignRecord,
  content: {
    subject?: string;
    previewText?: string | null;
    bodyHtml?: string | null;
    bodyText?: string | null;
    fromName?: string | null;
    status?: "draft" | "ready";
  },
): Promise<void> {
  await ensureSingleNewsletterStep(workspaceId, campaign, content);
}

/**
 * Send a rendered test of the current newsletter draft to manually entered addresses.
 * Does not snapshot audience, create enrollments, or enroll into drips.
 */
export async function sendNewsletterTestEmailsForWorkspace(
  workspaceId: string,
  actorId: string,
  campaignId: string,
  emails: string[],
): Promise<{ sent: number; messageIds: string[] }> {
  const campaign = await findCampaignById(workspaceId, campaignId);
  if (!campaign) {
    throw new AppError("NOT_FOUND", "Newsletter not found.");
  }
  assertIsNewsletter(campaign);
  await assertMultiProjectRecordAccess(
    workspaceId,
    actorId,
    campaign.projectIds,
    "campaign:update",
  );

  if (campaign.status === "archived") {
    throw new AppError(
      "VALIDATION_ERROR",
      "Archived newsletters cannot send test emails. Restore the newsletter first.",
    );
  }

  assertNewsletterTestSendRateLimit(workspaceId, actorId, emails.length);

  const step = await findFirstCampaignStep(workspaceId, campaignId);
  if (!step) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Save newsletter content before sending a test email.",
    );
  }

  if (!step.subject?.trim()) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Add a subject line before sending a test email.",
    );
  }

  const htmlSource = step.bodyHtml?.trim() || step.body?.trim() || "";
  if (!htmlSource) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Add HTML content before sending a test email.",
    );
  }

  if (step.bodyHtml?.trim()) {
    const blocking = validateCampaignHtml(step.bodyHtml).filter(
      (warning) =>
        warning.code === "unsafe_tags" || warning.code === "unsafe_javascript",
    );
    if (blocking.length > 0) {
      throw new AppError(
        "VALIDATION_ERROR",
        blocking[0]?.message ?? "Resolve unsafe HTML before sending a test email.",
      );
    }
  }

  const fromName = resolveCampaignStepFromName(step.fromName, campaign);
  if (!fromName) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Set a from name before sending a test email.",
    );
  }

  if (!campaign.sendingDomainId || !campaign.senderEmail) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Configure a verified sending domain and sender email before sending a test email.",
    );
  }

  await assertVerifiedSenderEmail(
    workspaceId,
    campaign.sendingDomainId,
    campaign.senderEmail,
  );

  // Sample unsubscribe URL — same treatment as drip step test-email (preview path).
  const previewUnsubscribeUrl = "https://example.com/unsubscribe?token=preview";
  const previewContext = {
    ...CAMPAIGN_EMAIL_PREVIEW_CONTEXT,
    unsubscribeUrl: previewUnsubscribeUrl,
  };

  const resolvedBody = applyCampaignVariables(step.body || "", previewContext);
  const resolvedHtml = step.bodyHtml
    ? applyCampaignVariables(step.bodyHtml, previewContext)
    : null;
  const html = buildCampaignEmailHtml(resolvedBody, previewUnsubscribeUrl, {
    htmlBody: resolvedHtml,
    previewText: step.previewText
      ? applyCampaignVariables(step.previewText, previewContext)
      : null,
  });

  const plainTextSource = step.bodyText?.trim() || resolvedBody || "";
  const plainText = buildCampaignEmailPlainText(
    applyCampaignVariables(plainTextSource, previewContext),
    previewUnsubscribeUrl,
  );

  const subject = `[Test] ${applyCampaignVariables(step.subject, previewContext)}`;
  const messageIds: string[] = [];

  for (const to of emails) {
    const result = await sendCampaignEmail({
      to,
      subject,
      html,
      text: plainText,
      fromName,
      fromEmail: campaign.senderEmail,
      tags: [
        { name: "workspace_id", value: workspaceId },
        { name: "campaign_id", value: campaignId },
        { name: "campaign_step_id", value: step.id },
        { name: "newsletter_test", value: "true" },
      ],
    });

    if (!result.success) {
      const sentCount = messageIds.length;
      throw new AppError(
        "VALIDATION_ERROR",
        sentCount > 0
          ? `Sent ${sentCount} test email${sentCount === 1 ? "" : "s"}, then failed at ${to}: ${result.error ?? "send failed."}`
          : (result.error ?? `Could not send the test email to ${to}.`),
        {
          details: {
            sent: sentCount,
            failedAt: to,
            messageIds,
          },
        },
      );
    }

    messageIds.push(result.messageId);
  }

  await createAuditLog({
    workspaceId,
    actorId,
    action: "newsletter.test_sent",
    entityType: "campaign",
    entityId: campaignId,
    after: {
      recipientCount: emails.length,
      messageIds,
      subject,
    },
  });

  return { sent: messageIds.length, messageIds };
}
