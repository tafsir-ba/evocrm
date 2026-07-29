import "server-only";

import { createAuditLog } from "@/server/audit/create-audit-log";
import {
  buildCampaignEmailHtml,
  sendCampaignEmail,
} from "@/server/email/resend";
import { AppError } from "@/server/errors";
import { findLeadById } from "@/server/repositories/leads";
import { loadCampaignEmailAttachments } from "@/server/services/campaign-email-attachments";
import {
  claimEnrollmentForSend,
  findActiveEnrollmentsByIds,
  findDueEnrollments,
  findEnrollmentByIdOnly,
  listAllCampaignEnrollments,
  releaseEnrollmentSendClaim,
  updateCampaignEnrollment,
  type CampaignEnrollmentRecord,
} from "@/server/repositories/campaign-enrollments";
import {
  findCampaignStepById,
  findNextStepAfterOrder,
  findStepByOrder,
} from "@/server/repositories/campaign-steps";
import { findCampaignById } from "@/server/repositories/campaigns";
import { findWorkspaceById } from "@/server/repositories/workspaces";
import { createCampaignSend, findSentCampaignSendForEnrollmentStep } from "@/server/repositories/campaign-sends";
import {
  createUnsubscribeToken,
  buildUnsubscribeUrl,
} from "@/server/utils/unsubscribe-token";
import { addDays, computeNextSendAt, isScheduledSendDue } from "@/server/utils/campaign-schedule";
import { resolveCampaignStepFromName } from "@/server/utils/campaign-from-name";
import { findSuppressionByEmail } from "@/server/repositories/email-suppressions";
import { applyCampaignVariables } from "@/lib/campaign-email";
import { buildCampaignVariableContext } from "@/server/utils/campaign-variable-context";
import { reconcileEnrollmentBeforeSend } from "@/server/services/campaign-enrollment-reconcile";
import { assertVerifiedSenderEmail } from "@/server/services/sending-domains";

export type SendDueSummary = {
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
};

const SKIP_RETRY_DELAY_DAYS = 1;
const FAILURE_RETRY_DELAY_DAYS = 1;
const MAX_ZERO_DELAY_CHAIN = 20;

export type ProcessEnrollmentResult = {
  outcome: "sent" | "skipped" | "failed";
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
};

function singleOutcomeResult(
  outcome: ProcessEnrollmentResult["outcome"],
): ProcessEnrollmentResult {
  return {
    outcome,
    processed: 1,
    sent: outcome === "sent" ? 1 : 0,
    skipped: outcome === "skipped" ? 1 : 0,
    failed: outcome === "failed" ? 1 : 0,
  };
}

function mergeProcessResults(
  current: ProcessEnrollmentResult,
  next: ProcessEnrollmentResult,
): ProcessEnrollmentResult {
  return {
    outcome: next.outcome,
    processed: current.processed + next.processed,
    sent: current.sent + next.sent,
    skipped: current.skipped + next.skipped,
    failed: current.failed + next.failed,
  };
}

async function deferEnrollmentRetry(
  workspaceId: string,
  enrollmentId: string,
  from: Date,
  delayDays: number,
): Promise<void> {
  await updateCampaignEnrollment(workspaceId, enrollmentId, {
    nextSendAt: addDays(from, delayDays),
  });
}

function isLeadUnsubscribed(lead: {
  emailConsentStatus: string;
  emailUnsubscribedAt: Date | null;
}): boolean {
  return (
    lead.emailConsentStatus === "unsubscribed" || lead.emailUnsubscribedAt !== null
  );
}

async function recordSkippedSend(params: {
  workspaceId: string;
  enrollment: CampaignEnrollmentRecord;
  stepId: string;
  reason: string;
  actorId?: string;
  deferDays?: number;
}): Promise<void> {
  await createCampaignSend(params.workspaceId, {
    campaignId: params.enrollment.campaignId,
    campaignStepId: params.stepId,
    enrollmentId: params.enrollment.id,
    leadId: params.enrollment.leadId,
    opportunityId: params.enrollment.opportunityId,
    status: "skipped",
    error: params.reason,
    scheduledFor: params.enrollment.nextSendAt,
    sentAt: null,
  });

  await createAuditLog({
    workspaceId: params.workspaceId,
    actorId: params.actorId ?? "system",
    action: "campaign_email.skipped",
    entityType: "campaign_send",
    entityId: params.enrollment.id,
    after: { reason: params.reason, enrollmentId: params.enrollment.id },
  });

  if (params.deferDays !== undefined) {
    await deferEnrollmentRetry(
      params.workspaceId,
      params.enrollment.id,
      new Date(),
      params.deferDays,
    );
  }
}

async function processEnrollment(
  enrollment: CampaignEnrollmentRecord,
  chainDepth = 0,
): Promise<ProcessEnrollmentResult> {
  const workspaceId = enrollment.workspaceId;

  const campaign = await findCampaignById(workspaceId, enrollment.campaignId);

  if (!campaign || campaign.status !== "active") {
    return singleOutcomeResult("skipped");
  }

  if (enrollment.status !== "active") {
    const step = await findStepByOrder(
      workspaceId,
      enrollment.campaignId,
      enrollment.currentStep,
    );

    if (step) {
      await recordSkippedSend({
        workspaceId,
        enrollment,
        stepId: step.id,
        reason: "Enrollment is not active.",
      });
    }

    return singleOutcomeResult("skipped");
  }

  const step = await findStepByOrder(
    workspaceId,
    enrollment.campaignId,
    enrollment.currentStep,
  );

  if (!step) {
    await updateCampaignEnrollment(workspaceId, enrollment.id, {
      status: "failed",
      failedAt: new Date(),
      failureReason: "Campaign step not found.",
    });

    return singleOutcomeResult("failed");
  }

  if (step.status === "paused" || step.status === "draft") {
    await recordSkippedSend({
      workspaceId,
      enrollment,
      stepId: step.id,
      reason: `Step is ${step.status} and cannot send.`,
      deferDays: SKIP_RETRY_DELAY_DAYS,
    });

    return singleOutcomeResult("skipped");
  }

  if (!isScheduledSendDue(enrollment.nextSendAt)) {
    return singleOutcomeResult("skipped");
  }

  const claimedEnrollment = await claimEnrollmentForSend(
    workspaceId,
    enrollment.id,
    enrollment.currentStep,
  );

  if (!claimedEnrollment) {
    return singleOutcomeResult("skipped");
  }

  enrollment = claimedEnrollment;
  let shouldReleaseSendClaim = true;

  try {
    const existingSend = await findSentCampaignSendForEnrollmentStep(
      workspaceId,
      enrollment.id,
      step.id,
    );

    if (existingSend) {
      return singleOutcomeResult("skipped");
    }

  if (!enrollment.leadId) {
    await recordSkippedSend({
      workspaceId,
      enrollment,
      stepId: step.id,
      reason: "Enrollment has no associated lead.",
      deferDays: SKIP_RETRY_DELAY_DAYS,
    });

    return singleOutcomeResult("skipped");
  }

  const lead = await findLeadById(workspaceId, enrollment.leadId);

  if (!lead) {
    await recordSkippedSend({
      workspaceId,
      enrollment,
      stepId: step.id,
      reason: "Lead not found.",
      deferDays: SKIP_RETRY_DELAY_DAYS,
    });

    return singleOutcomeResult("skipped");
  }

  if (!lead.email) {
    await recordSkippedSend({
      workspaceId,
      enrollment,
      stepId: step.id,
      reason: "Lead has no email address.",
      deferDays: SKIP_RETRY_DELAY_DAYS,
    });

    return singleOutcomeResult("skipped");
  }

  if (isLeadUnsubscribed(lead)) {
    await recordSkippedSend({
      workspaceId,
      enrollment,
      stepId: step.id,
      reason: "Lead is unsubscribed.",
    });

    await updateCampaignEnrollment(workspaceId, enrollment.id, {
      status: "unsubscribed",
      unsubscribedAt: new Date(),
      sendClaimExpiresAt: null,
    });
    shouldReleaseSendClaim = false;

    return singleOutcomeResult("skipped");
  }

  if (lead.email) {
    const suppression = await findSuppressionByEmail(workspaceId, lead.email);
    if (suppression) {
      await recordSkippedSend({
        workspaceId,
        enrollment,
        stepId: step.id,
        reason: `Recipient is suppressed (${suppression.reason}).`,
        deferDays: SKIP_RETRY_DELAY_DAYS,
      });

      return singleOutcomeResult("skipped");
    }
  }

  const token = createUnsubscribeToken({
    workspaceId,
    leadId: lead.id,
    enrollmentId: enrollment.id,
    campaignId: campaign.id,
  });
  const unsubscribeUrl = buildUnsubscribeUrl(token);
  const fromName = resolveCampaignStepFromName(step.fromName, campaign);

  if (!fromName) {
    await recordSkippedSend({
      workspaceId,
      enrollment,
      stepId: step.id,
      reason: "Step from name is missing.",
      deferDays: SKIP_RETRY_DELAY_DAYS,
    });

    return singleOutcomeResult("skipped");
  }

  if (!campaign.senderEmail?.trim()) {
    await recordSkippedSend({
      workspaceId,
      enrollment,
      stepId: step.id,
      reason: "Campaign sender email is not configured.",
      deferDays: SKIP_RETRY_DELAY_DAYS,
    });

    return singleOutcomeResult("skipped");
  }

  if (!campaign.sendingDomainId) {
    await recordSkippedSend({
      workspaceId,
      enrollment,
      stepId: step.id,
      reason: "Campaign sending domain is not configured.",
      deferDays: SKIP_RETRY_DELAY_DAYS,
    });

    return singleOutcomeResult("skipped");
  }

  try {
    await assertVerifiedSenderEmail(
      workspaceId,
      campaign.sendingDomainId,
      campaign.senderEmail,
    );
  } catch {
    await recordSkippedSend({
      workspaceId,
      enrollment,
      stepId: step.id,
      reason: "Campaign sender domain is no longer verified.",
      deferDays: SKIP_RETRY_DELAY_DAYS,
    });

    return singleOutcomeResult("skipped");
  }

  const variableContext = await buildCampaignVariableContext({
    workspaceId,
    enrollment,
    lead,
    unsubscribeUrl,
  });
  const resolvedSubject = applyCampaignVariables(step.subject, variableContext);
  const resolvedBody = applyCampaignVariables(step.body, variableContext);
  const resolvedHtmlBody = step.bodyHtml
    ? applyCampaignVariables(step.bodyHtml, variableContext)
    : null;
  const html = buildCampaignEmailHtml(resolvedBody, unsubscribeUrl, {
    htmlBody: resolvedHtmlBody,
    previewText: step.previewText,
  });

  const plainText =
    step.bodyText?.trim() ||
    resolvedBody ||
    `${resolvedBody}\n\nUnsubscribe: ${unsubscribeUrl}`;

  const attachmentResult = await loadCampaignEmailAttachments(
    workspaceId,
    step.documentIds,
  );

  if (!attachmentResult.ok) {
    await recordSkippedSend({
      workspaceId,
      enrollment,
      stepId: step.id,
      reason: attachmentResult.error,
      deferDays: SKIP_RETRY_DELAY_DAYS,
    });

    return singleOutcomeResult("skipped");
  }

  const sendResult = await sendCampaignEmail({
    to: lead.email,
    subject: resolvedSubject,
    html,
    text: plainText.includes("Unsubscribe")
      ? plainText
      : `${plainText}\n\nUnsubscribe: ${unsubscribeUrl}`,
    fromName,
    fromEmail: campaign.senderEmail,
    attachments: attachmentResult.attachments,
    tags: [
      { name: "workspace_id", value: workspaceId },
      { name: "campaign_id", value: campaign.id },
      { name: "campaign_step_id", value: step.id },
      { name: "contact_id", value: lead.id },
    ],
  });

  const now = new Date();

  if (!sendResult.success) {
    await createCampaignSend(workspaceId, {
      campaignId: enrollment.campaignId,
      campaignStepId: step.id,
      enrollmentId: enrollment.id,
      leadId: enrollment.leadId,
      opportunityId: enrollment.opportunityId,
      status: "failed",
      error: sendResult.error,
      scheduledFor: enrollment.nextSendAt,
      sentAt: null,
    });

    await createAuditLog({
      workspaceId,
      actorId: "system",
      action: "campaign_email.failed",
      entityType: "campaign_send",
      entityId: enrollment.id,
      after: { error: sendResult.error, enrollmentId: enrollment.id },
    });

    await deferEnrollmentRetry(
      workspaceId,
      enrollment.id,
      now,
      FAILURE_RETRY_DELAY_DAYS,
    );

    return singleOutcomeResult("failed");
  }

  await createCampaignSend(workspaceId, {
    campaignId: enrollment.campaignId,
    campaignStepId: step.id,
    enrollmentId: enrollment.id,
    leadId: enrollment.leadId,
    opportunityId: enrollment.opportunityId,
    status: "sent",
    providerMessageId: sendResult.messageId,
    scheduledFor: enrollment.nextSendAt,
    sentAt: now,
  });

  await createAuditLog({
    workspaceId,
    actorId: "system",
    action: "campaign_email.sent",
    entityType: "campaign_send",
    entityId: enrollment.id,
    after: {
      messageId: sendResult.messageId,
      enrollmentId: enrollment.id,
      stepId: step.id,
    },
  });

  const nextStep = await findNextStepAfterOrder(
    workspaceId,
    enrollment.campaignId,
    step.order,
  );

  if (nextStep) {
    const workspace = await findWorkspaceById(workspaceId);
    const timeZone = workspace?.timezone ?? "UTC";

    const nextSendAt = computeNextSendAt(now, nextStep.delayDays, {
      sendTime: nextStep.sendTime,
      timeZone,
    });

    await updateCampaignEnrollment(workspaceId, enrollment.id, {
      currentStep: nextStep.order,
      nextSendAt,
      lastSentAt: now,
      sendClaimExpiresAt: null,
    });
    shouldReleaseSendClaim = false;

    if (
      nextStep.delayDays <= 0 &&
      chainDepth < MAX_ZERO_DELAY_CHAIN &&
      nextSendAt <= now
    ) {
      const refreshed = await findEnrollmentByIdOnly(workspaceId, enrollment.id);

      if (refreshed && refreshed.status === "active") {
        return mergeProcessResults(
          singleOutcomeResult("sent"),
          await processEnrollment(refreshed, chainDepth + 1),
        );
      }
    }
  } else {
    await updateCampaignEnrollment(workspaceId, enrollment.id, {
      status: "completed",
      completedAt: now,
      lastSentAt: now,
      sendClaimExpiresAt: null,
    });
    shouldReleaseSendClaim = false;

    await createAuditLog({
      workspaceId,
      actorId: "system",
      action: "campaign_enrollment.completed",
      entityType: "campaign_enrollment",
      entityId: enrollment.id,
    });
  }

  return singleOutcomeResult("sent");
  } finally {
    if (shouldReleaseSendClaim) {
      await releaseEnrollmentSendClaim(workspaceId, enrollment.id);
    }
  }
}

async function summarizeEnrollmentProcessing(
  enrollments: CampaignEnrollmentRecord[],
): Promise<SendDueSummary> {
  const summary: SendDueSummary = {
    processed: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
  };

  for (const enrollment of enrollments) {
    try {
      const reconciled = await reconcileEnrollmentBeforeSend(
        enrollment.workspaceId,
        enrollment,
      );
      const result = await processEnrollment(reconciled);
      summary.processed += result.processed;
      summary.sent += result.sent;
      summary.skipped += result.skipped;
      summary.failed += result.failed;
    } catch {
      summary.processed += 1;
      summary.failed += 1;
    }
  }

  return summary;
}

function filterEnrollmentsForImmediateSend(
  enrollments: CampaignEnrollmentRecord[],
  mode: "activation" | "resume" | "enrollment",
  enrollmentIds?: string[],
): CampaignEnrollmentRecord[] {
  const idFilter = enrollmentIds ? new Set(enrollmentIds) : null;
  const now = new Date();

  return enrollments.filter((enrollment) => {
    if (idFilter && !idFilter.has(enrollment.id)) {
      return false;
    }

    if (
      (mode === "activation" || mode === "enrollment") &&
      enrollment.lastSentAt !== null
    ) {
      return false;
    }

    return enrollment.nextSendAt <= now;
  });
}

export async function sendCampaignEnrollmentsImmediately(
  workspaceId: string,
  campaignId: string,
  mode: "activation" | "resume" | "enrollment",
  enrollmentIds?: string[],
): Promise<SendDueSummary> {
  const enrollments =
    enrollmentIds && enrollmentIds.length > 0
      ? await findActiveEnrollmentsByIds(workspaceId, enrollmentIds)
      : await listAllCampaignEnrollments(workspaceId, campaignId, { status: "active" });

  const eligible = filterEnrollmentsForImmediateSend(enrollments, mode, enrollmentIds);

  return summarizeEnrollmentProcessing(eligible);
}

export async function sendDueCampaignEmails(
  limit = 50,
): Promise<SendDueSummary> {
  const dueEnrollments = await findDueEnrollments(limit);

  return summarizeEnrollmentProcessing(dueEnrollments);
}

export async function listCampaignSendsForWorkspace(
  workspaceId: string,
  campaignId: string,
  filter: { status?: "queued" | "sent" | "failed" | "skipped"; page?: number; pageSize?: number } = {},
) {
  const campaign = await findCampaignById(workspaceId, campaignId);

  if (!campaign) {
    throw new AppError("NOT_FOUND", "Campaign not found.");
  }

  const { findCampaignSends } = await import("@/server/repositories/campaign-sends");
  const { sends, total } = await findCampaignSends(workspaceId, campaignId, filter);

  const enriched = await Promise.all(
    sends.map(async (send) => {
      let leadName: string | null = null;
      let stepSubject: string | null = null;

      if (send.leadId) {
        const lead = await findLeadById(workspaceId, send.leadId);
        leadName = lead?.fullName ?? null;
      }

      const step = await findCampaignStepById(
        workspaceId,
        campaignId,
        send.campaignStepId,
      );
      stepSubject = step?.subject ?? null;

      return { ...send, leadName, stepSubject };
    }),
  );

  return { sends: enriched, total };
}
