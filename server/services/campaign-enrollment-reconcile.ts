import "server-only";

import {
  updateCampaignEnrollment,
  type CampaignEnrollmentRecord,
} from "@/server/repositories/campaign-enrollments";
import { findCampaignSteps } from "@/server/repositories/campaign-steps";
import { findCampaignSendsByEnrollmentIds } from "@/server/repositories/campaign-sends";
import { findWorkspaceById } from "@/server/repositories/workspaces";
import {
  computeEnrollmentNextSendAt,
  findFirstUnsentStepOrder,
  findLatestConfirmedSentAt,
  mapLatestSendLogsByStepOrder,
  type CampaignStepScheduleInput,
  type EnrollmentStepSendLog,
} from "@/server/utils/campaign-enrollment-schedule";

export async function reconcileEnrollmentWithSendLogs(
  workspaceId: string,
  enrollment: CampaignEnrollmentRecord,
  steps: CampaignStepScheduleInput[],
  sendLogsByStepOrder: Map<number, EnrollmentStepSendLog>,
  timeZone: string,
): Promise<CampaignEnrollmentRecord> {
  const firstUnsentOrder = findFirstUnsentStepOrder(steps, sendLogsByStepOrder);

  if (firstUnsentOrder === null) {
    if (enrollment.status !== "active" && enrollment.status !== "paused") {
      return enrollment;
    }

    const latestSentAt = findLatestConfirmedSentAt(steps, sendLogsByStepOrder);

    if (!latestSentAt) {
      return enrollment;
    }

    const updated = await updateCampaignEnrollment(workspaceId, enrollment.id, {
      status: "completed",
      currentStep: Math.max(...steps.map((item) => item.order)),
      completedAt: latestSentAt,
      lastSentAt: latestSentAt,
      sendClaimExpiresAt: null,
    });

    return updated ?? enrollment;
  }

  const step = steps.find((item) => item.order === firstUnsentOrder);

  if (!step) {
    return enrollment;
  }

  const currentStepDrifted = enrollment.currentStep !== firstUnsentOrder;
  const completedWithRemainingSteps = enrollment.status === "completed";

  if (!completedWithRemainingSteps && !currentStepDrifted) {
    return enrollment;
  }

  const now = new Date();
  const updated = await updateCampaignEnrollment(workspaceId, enrollment.id, {
    status: enrollment.status === "paused" ? "paused" : "active",
    currentStep: firstUnsentOrder,
    nextSendAt: computeEnrollmentNextSendAt(enrollment, step, timeZone, now),
    completedAt: null,
  });

  return updated ?? enrollment;
}

export async function loadEnrollmentReconcileContext(
  workspaceId: string,
  campaignId: string,
): Promise<{
  steps: CampaignStepScheduleInput[];
  timeZone: string;
}> {
  const [steps, workspace] = await Promise.all([
    findCampaignSteps(workspaceId, campaignId),
    findWorkspaceById(workspaceId),
  ]);

  return {
    steps: steps.map((step) => ({
      id: step.id,
      order: step.order,
      delayDays: step.delayDays,
      sendTime: step.sendTime,
      subject: step.subject,
    })),
    timeZone: workspace?.timezone ?? "UTC",
  };
}

export async function reconcileEnrollmentBeforeSend(
  workspaceId: string,
  enrollment: CampaignEnrollmentRecord,
): Promise<CampaignEnrollmentRecord> {
  const { steps, timeZone } = await loadEnrollmentReconcileContext(
    workspaceId,
    enrollment.campaignId,
  );
  const sends = await findCampaignSendsByEnrollmentIds(workspaceId, [enrollment.id]);
  const sendLogs = mapLatestSendLogsByStepOrder(steps, sends);

  return reconcileEnrollmentWithSendLogs(
    workspaceId,
    enrollment,
    steps,
    sendLogs,
    timeZone,
  );
}
