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
  createdAt: Date;
};

export function isConfirmedCampaignSend(
  sendLog: EnrollmentStepSendLog | undefined,
): sendLog is EnrollmentStepSendLog & {
  status: "sent";
  providerMessageId: string;
} {
  return sendLog?.status === "sent" && sendLog.providerMessageId !== null;
}

function toEnrollmentStepSendLog(
  send: Pick<
    CampaignSendRecord,
    "status" | "providerMessageId" | "sentAt" | "scheduledFor" | "createdAt"
  >,
): EnrollmentStepSendLog {
  return {
    status: send.status,
    providerMessageId: send.providerMessageId,
    sentAt: send.sentAt,
    scheduledFor: send.scheduledFor,
    createdAt: send.createdAt,
  };
}

function isDeferredRetryForCurrentStep(
  enrollment: Pick<CampaignEnrollmentRecord, "currentStep" | "status" | "nextSendAt">,
  stepOrder: number,
  sendLog: EnrollmentStepSendLog | undefined,
): boolean {
  if (
    sendLog?.status !== "skipped" &&
    sendLog?.status !== "failed"
  ) {
    return false;
  }

  if (stepOrder !== enrollment.currentStep) {
    return false;
  }

  if (enrollment.status !== "active" && enrollment.status !== "paused") {
    return false;
  }

  return enrollment.nextSendAt.getTime() > sendLog.scheduledFor.getTime();
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
  const logsByOrder = new Map<number, EnrollmentStepSendLog[]>();

  for (const send of sends) {
    const order = stepIdToOrder.get(send.campaignStepId);

    if (order === undefined) {
      continue;
    }

    const existing = logsByOrder.get(order) ?? [];
    existing.push(toEnrollmentStepSendLog(send));
    logsByOrder.set(order, existing);
  }

  const latestByOrder = new Map<number, EnrollmentStepSendLog>();

  for (const [order, logs] of logsByOrder) {
    const confirmedSends = logs.filter((log) => isConfirmedCampaignSend(log));

    if (confirmedSends.length > 0) {
      const latestConfirmed = [...confirmedSends].sort(
        (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
      )[0];
      latestByOrder.set(order, latestConfirmed);
      continue;
    }

    const latestLog = [...logs].sort(
      (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
    )[0];

    if (latestLog) {
      latestByOrder.set(order, latestLog);
    }
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

    if (sendLog?.status === "failed" && !isDeferredRetryForCurrentStep(enrollment, step.order, sendLog)) {
      schedule.push({
        stepOrder: step.order,
        subject: step.subject,
        scheduledAt: sendLog.scheduledFor,
        state: "failed",
      });
      timelineAnchor = sendLog.scheduledFor;
      continue;
    }

    if (sendLog?.status === "skipped" && !isDeferredRetryForCurrentStep(enrollment, step.order, sendLog)) {
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

export function findLatestConfirmedSentAt(
  steps: CampaignStepScheduleInput[],
  sendLogsByStepOrder: Map<number, EnrollmentStepSendLog>,
): Date | null {
  let latestSentAt: Date | null = null;

  for (const step of steps) {
    const sendLog = sendLogsByStepOrder.get(step.order);

    if (!isConfirmedCampaignSend(sendLog)) {
      continue;
    }

    const sentAt = sendLog.sentAt ?? sendLog.scheduledFor;

    if (!latestSentAt || sentAt.getTime() > latestSentAt.getTime()) {
      latestSentAt = sentAt;
    }
  }

  return latestSentAt;
}
