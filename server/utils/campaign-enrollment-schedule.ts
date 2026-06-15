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
    "currentStep" | "nextSendAt" | "status"
  >,
  steps: CampaignStepScheduleInput[],
  timeZone = "UTC",
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
  let sendAnchor = enrollment.nextSendAt;

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

    if (step.order === enrollment.currentStep) {
      schedule.push({
        stepOrder: step.order,
        subject: step.subject,
        scheduledAt: enrollment.nextSendAt,
        state: terminalStates.has(enrollment.status)
          ? "cancelled"
          : isPaused
            ? "paused"
            : "pending",
      });
      sendAnchor = enrollment.nextSendAt;
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

    sendAnchor = computeNextSendAt(sendAnchor, step.delayDays, {
      sendTime: step.sendTime,
      timeZone,
    });
    schedule.push({
      stepOrder: step.order,
      subject: step.subject,
      scheduledAt: sendAnchor,
      state: isPaused ? "paused" : "pending",
    });
  }

  return schedule;
}
