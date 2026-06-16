import "server-only";

import type { CampaignEnrollmentRecord } from "@/server/repositories/campaign-enrollments";
import type { CampaignSendRecord } from "@/server/repositories/campaign-sends";
import { computeNextSendAt } from "@/server/utils/campaign-schedule";

export type EnrollmentScheduledStep = {
  stepOrder: number;
  subject: string;
  scheduledAt: Date | null;
  state:
    | "sent"
    | "scheduled"
    | "queued"
    | "sending"
    | "pending"
    | "paused"
    | "cancelled"
    | "failed"
    | "skipped";
};

export type CampaignStepScheduleInput = {
  id: string;
  order: number;
  delayDays: number;
  sendTime: string;
  subject: string;
};

export type EnrollmentStepSendLog = {
  status: CampaignSendRecord["status"];
  providerMessageId: string | null;
  sentAt: Date | null;
  scheduledFor: Date;
};

export function isConfirmedCampaignSend(
  sendLog: EnrollmentStepSendLog | undefined,
): sendLog is EnrollmentStepSendLog & {
  status: "sent";
  providerMessageId: string;
} {
  return sendLog?.status === "sent" && sendLog.providerMessageId !== null;
}

export function mapLatestSendLogsByStepOrder(
  steps: Array<Pick<CampaignStepScheduleInput, "id" | "order">>,
  sends: Array<
    Pick<
      CampaignSendRecord,
      "campaignStepId" | "status" | "providerMessageId" | "sentAt" | "scheduledFor" | "createdAt"
    >
  >,
): Map<number, EnrollmentStepSendLog> {
  const stepIdToOrder = new Map(steps.map((step) => [step.id, step.order]));
  const latestByOrder = new Map<number, EnrollmentStepSendLog>();

  const sortedSends = [...sends].sort(
    (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
  );

  for (const send of sortedSends) {
    const order = stepIdToOrder.get(send.campaignStepId);

    if (order === undefined || latestByOrder.has(order)) {
      continue;
    }

    latestByOrder.set(order, {
      status: send.status,
      providerMessageId: send.providerMessageId,
      sentAt: send.sentAt,
      scheduledFor: send.scheduledFor,
    });
  }

  return latestByOrder;
}

export function buildEnrollmentScheduledSteps(
  enrollment: Pick<
    CampaignEnrollmentRecord,
    | "currentStep"
    | "status"
    | "createdAt"
    | "lastSentAt"
    | "nextSendAt"
    | "sendClaimExpiresAt"
  >,
  steps: CampaignStepScheduleInput[],
  sendLogsByStepOrder: Map<number, EnrollmentStepSendLog> = new Map(),
  timeZone = "UTC",
  now = new Date(),
): EnrollmentScheduledStep[] {
  const sortedSteps = [...steps].sort((left, right) => left.order - right.order);

  if (sortedSteps.length === 0) {
    return [];
  }

  const terminalStates = new Set<CampaignEnrollmentRecord["status"]>([
    "unsubscribed",
    "failed",
  ]);
  const isPaused = enrollment.status === "paused";

  const schedule: EnrollmentScheduledStep[] = [];
  let timelineAnchor = enrollment.lastSentAt ?? enrollment.nextSendAt ?? now;

  for (const step of sortedSteps) {
    const sendLog = sendLogsByStepOrder.get(step.order);

    if (isConfirmedCampaignSend(sendLog)) {
      const sentAt = sendLog.sentAt ?? sendLog.scheduledFor;
      schedule.push({
        stepOrder: step.order,
        subject: step.subject,
        scheduledAt: sentAt,
        state: "sent",
      });
      timelineAnchor = sentAt;
      continue;
    }

    if (sendLog?.status === "failed") {
      schedule.push({
        stepOrder: step.order,
        subject: step.subject,
        scheduledAt: sendLog.scheduledFor,
        state: "failed",
      });
      timelineAnchor = sendLog.scheduledFor;
      continue;
    }

    if (sendLog?.status === "skipped") {
      schedule.push({
        stepOrder: step.order,
        subject: step.subject,
        scheduledAt: sendLog.scheduledFor,
        state: "skipped",
      });
      timelineAnchor = sendLog.scheduledFor;
      continue;
    }

    if (sendLog?.status === "queued") {
      schedule.push({
        stepOrder: step.order,
        subject: step.subject,
        scheduledAt: sendLog.scheduledFor,
        state: "queued",
      });
      timelineAnchor = sendLog.scheduledFor;
      continue;
    }

    if (terminalStates.has(enrollment.status)) {
      schedule.push({
        stepOrder: step.order,
        subject: step.subject,
        scheduledAt: null,
        state: "cancelled",
      });
      continue;
    }

    const scheduledAt =
      step.order === enrollment.currentStep &&
      (enrollment.status === "active" || enrollment.status === "completed")
        ? enrollment.nextSendAt
        : computeNextSendAt(timelineAnchor, step.delayDays, {
            sendTime: step.sendTime,
            timeZone,
          });

    const hasActiveSendClaim =
      step.order === enrollment.currentStep &&
      enrollment.sendClaimExpiresAt !== null &&
      enrollment.sendClaimExpiresAt > now;

    let state: EnrollmentScheduledStep["state"];

    if (isPaused) {
      state = "paused";
    } else if (hasActiveSendClaim) {
      state = "sending";
    } else if (scheduledAt > now) {
      state = "scheduled";
    } else {
      state = "pending";
    }

    schedule.push({
      stepOrder: step.order,
      subject: step.subject,
      scheduledAt,
      state,
    });

    timelineAnchor = scheduledAt;
  }

  return schedule;
}

export function computeEnrollmentNextSendAt(
  enrollment: Pick<CampaignEnrollmentRecord, "createdAt" | "lastSentAt" | "currentStep">,
  step: Pick<CampaignStepScheduleInput, "delayDays" | "sendTime">,
  timeZone: string,
  now = new Date(),
): Date {
  const anchor = enrollment.lastSentAt ?? now;
  return computeNextSendAt(anchor, step.delayDays, {
    sendTime: step.sendTime,
    timeZone,
  });
}

export function findFirstUnsentStepOrder(
  steps: CampaignStepScheduleInput[],
  sendLogsByStepOrder: Map<number, EnrollmentStepSendLog>,
): number | null {
  const sortedSteps = [...steps].sort((left, right) => left.order - right.order);

  for (const step of sortedSteps) {
    if (!isConfirmedCampaignSend(sendLogsByStepOrder.get(step.order))) {
      return step.order;
    }
  }

  return null;
}
