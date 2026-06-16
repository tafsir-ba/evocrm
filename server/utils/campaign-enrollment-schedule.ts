import "server-only";

import type { CampaignEnrollmentRecord } from "@/server/repositories/campaign-enrollments";
import { computeNextSendAt } from "@/server/utils/campaign-schedule";

export type EnrollmentScheduledStep = {
  stepOrder: number;
  subject: string;
  scheduledAt: Date | null;
  state: "sent" | "pending" | "paused" | "cancelled";
};

export type CampaignStepScheduleInput = {
  order: number;
  delayDays: number;
  sendTime: string;
  subject: string;
};

export function buildEnrollmentScheduledSteps(
  enrollment: Pick<
    CampaignEnrollmentRecord,
    "currentStep" | "status" | "createdAt" | "lastSentAt"
  >,
  steps: CampaignStepScheduleInput[],
  timeZone = "UTC",
  now = new Date(),
): EnrollmentScheduledStep[] {
  const sortedSteps = [...steps].sort((left, right) => left.order - right.order);

  if (sortedSteps.length === 0) {
    return [];
  }

  if (enrollment.status === "completed") {
    return sortedSteps.map((step) => ({
      stepOrder: step.order,
      subject: step.subject,
      scheduledAt: null,
      state: "sent",
    }));
  }

  const terminalStates = new Set<CampaignEnrollmentRecord["status"]>([
    "unsubscribed",
    "failed",
  ]);
  const isPaused = enrollment.status === "paused";

  const schedule: EnrollmentScheduledStep[] = [];
  let timelineAnchor = enrollment.lastSentAt ?? now;

  for (const step of sortedSteps) {
    if (step.order < enrollment.currentStep) {
      schedule.push({
        stepOrder: step.order,
        subject: step.subject,
        scheduledAt: null,
        state: "sent",
      });
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

    const scheduledAt = computeNextSendAt(timelineAnchor, step.delayDays, {
      sendTime: step.sendTime,
      timeZone,
    });

    schedule.push({
      stepOrder: step.order,
      subject: step.subject,
      scheduledAt,
      state: isPaused ? "paused" : "pending",
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
