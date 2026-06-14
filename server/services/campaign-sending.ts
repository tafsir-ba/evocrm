import "server-only";

import { createAuditLog } from "@/server/audit/create-audit-log";
import {
  buildCampaignEmailHtml,
  sendCampaignEmail,
} from "@/server/email/resend";
import { AppError } from "@/server/errors";
import { findLeadById } from "@/server/repositories/leads";
import {
  findCampaignEnrollments,
  findDueEnrollments,
  findEnrollmentByIdOnly,
  updateCampaignEnrollment,
  type CampaignEnrollmentRecord,
} from "@/server/repositories/campaign-enrollments";
import {
  findCampaignStepById,
  findNextStepAfterOrder,
  findStepByOrder,
} from "@/server/repositories/campaign-steps";
import { findCampaignById } from "@/server/repositories/campaigns";
import { createCampaignSend } from "@/server/repositories/campaign-sends";
import {
  createUnsubscribeToken,
  buildUnsubscribeUrl,
} from "@/server/utils/unsubscribe-token";
import { addDays, computeNextSendAt } from "@/server/utils/campaign-schedule";

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

  if (!enrollment.leadId) {
    await recordSkippedSend({
      workspaceId,
      enrollment,
      stepId: step.id,
      reason: "Enrollment has no associated lead.",
    });
    await deferEnrollmentRetry(
      workspaceId,
      enrollment.id,
      new Date(),
      SKIP_RETRY_DELAY_DAYS,
    );

    return singleOutcomeResult("skipped");
  }

  const lead = await findLeadById(workspaceId, enrollment.leadId);

  if (!lead) {
    await recordSkippedSend({
      workspaceId,
      enrollment,
      stepId: step.id,
      reason: "Lead not found.",
    });
    await deferEnrollmentRetry(
      workspaceId,
      enrollment.id,
      new Date(),
      SKIP_RETRY_DELAY_DAYS,
    );

    return singleOutcomeResult("skipped");
  }

  if (!lead.email) {
    await recordSkippedSend({
      workspaceId,
      enrollment,
      stepId: step.id,
      reason: "Lead has no email address.",
    });
    await deferEnrollmentRetry(
      workspaceId,
      enrollment.id,
      new Date(),
      SKIP_RETRY_DELAY_DAYS,
    );

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
    });

    return singleOutcomeResult("skipped");
  }

  const token = createUnsubscribeToken({
    workspaceId,
    leadId: lead.id,
    enrollmentId: enrollment.id,
    campaignId: campaign.id,
  });
  const unsubscribeUrl = buildUnsubscribeUrl(token);
  const html = buildCampaignEmailHtml(step.body, unsubscribeUrl);

  const sendResult = await sendCampaignEmail({
    to: lead.email,
    subject: step.subject,
    html,
    text: `${step.body}\n\nUnsubscribe: ${unsubscribeUrl}`,
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
    await updateCampaignEnrollment(workspaceId, enrollment.id, {
      currentStep: nextStep.order,
      nextSendAt: computeNextSendAt(now, nextStep.delayDays),
      lastSentAt: now,
    });

    if (nextStep.delayDays <= 0 && chainDepth < MAX_ZERO_DELAY_CHAIN) {
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
    });

    await createAuditLog({
      workspaceId,
      actorId: "system",
      action: "campaign_enrollment.completed",
      entityType: "campaign_enrollment",
      entityId: enrollment.id,
    });
  }

  return singleOutcomeResult("sent");
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
      const result = await processEnrollment(enrollment);
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

    if (idFilter) {
      return true;
    }

    if (mode === "activation" || mode === "enrollment") {
      return enrollment.lastSentAt === null;
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
  const { enrollments } = await findCampaignEnrollments(workspaceId, campaignId, {
    status: "active",
    pageSize: 500,
  });

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
