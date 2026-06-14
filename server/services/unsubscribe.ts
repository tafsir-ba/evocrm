import "server-only";

import { createAuditLog } from "@/server/audit/create-audit-log";
import { AppError } from "@/server/errors";
import { findLeadById, updateLead } from "@/server/repositories/leads";
import {
  findEnrollmentByIdOnly,
  updateCampaignEnrollment,
} from "@/server/repositories/campaign-enrollments";
import {
  verifyUnsubscribeToken,
  type UnsubscribeTokenPayload,
} from "@/server/utils/unsubscribe-token";

export type UnsubscribeResult = {
  success: boolean;
  message: string;
};

export async function processUnsubscribe(token: string): Promise<UnsubscribeResult> {
  let payload: UnsubscribeTokenPayload;

  try {
    payload = verifyUnsubscribeToken(token);
  } catch (error) {
    if (error instanceof AppError) {
      return { success: false, message: error.message };
    }

    return { success: false, message: "Invalid unsubscribe token." };
  }

  const { workspaceId, leadId, enrollmentId, campaignId } = payload;

  const lead = await findLeadById(workspaceId, leadId);

  if (!lead) {
    return { success: false, message: "Unable to process unsubscribe request." };
  }

  const now = new Date();

  await updateLead(workspaceId, leadId, {
    emailConsentStatus: "unsubscribed",
    emailUnsubscribedAt: now,
    emailUnsubscribeReason: "Campaign unsubscribe link",
  });

  const enrollment = await findEnrollmentByIdOnly(workspaceId, enrollmentId);

  if (
    enrollment &&
    enrollment.campaignId === campaignId &&
    enrollment.leadId === leadId &&
    enrollment.status !== "completed" &&
    enrollment.status !== "unsubscribed"
  ) {
    await updateCampaignEnrollment(workspaceId, enrollmentId, {
      status: "unsubscribed",
      unsubscribedAt: now,
    });
  }

  await createAuditLog({
    workspaceId,
    actorId: leadId,
    action: "campaign_unsubscribed",
    entityType: "campaign_enrollment",
    entityId: enrollmentId,
    after: { campaignId, leadId },
  });

  return {
    success: true,
    message: "You have been unsubscribed from campaign emails.",
  };
}
