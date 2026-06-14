import "server-only";

import { createAuditLog } from "@/server/audit/create-audit-log";
import { AppError } from "@/server/errors";
import { findLeadById } from "@/server/repositories/leads";
import { findOpportunityById } from "@/server/repositories/opportunities";
import {
  createCampaignEnrollment,
  findActiveEnrollmentByLead,
  findActiveEnrollmentByOpportunity,
  findCampaignEnrollments,
  findEnrollmentById,
  updateCampaignEnrollment,
  type CampaignEnrollmentRecord,
} from "@/server/repositories/campaign-enrollments";
import { findFirstCampaignStep } from "@/server/repositories/campaign-steps";
import { findCampaignById } from "@/server/repositories/campaigns";
import type {
  CreateCampaignEnrollmentInput,
  UpdateCampaignEnrollmentInput,
} from "@/server/validation/campaign-enrollments";

export type CampaignEnrollmentDetail = CampaignEnrollmentRecord & {
  leadName: string | null;
  leadEmail: string | null;
  leadEmailConsentStatus: string | null;
  opportunityLabel: string | null;
  warnings: string[];
};

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function enrollmentSnapshot(
  enrollment: CampaignEnrollmentRecord,
): Record<string, unknown> {
  return {
    id: enrollment.id,
    campaignId: enrollment.campaignId,
    leadId: enrollment.leadId,
    opportunityId: enrollment.opportunityId,
    status: enrollment.status,
    currentStep: enrollment.currentStep,
    nextSendAt: enrollment.nextSendAt,
  };
}

async function enrichEnrollment(
  workspaceId: string,
  enrollment: CampaignEnrollmentRecord,
): Promise<CampaignEnrollmentDetail> {
  const warnings: string[] = [];
  let leadName: string | null = null;
  let leadEmail: string | null = null;
  let leadEmailConsentStatus: string | null = null;
  let opportunityLabel: string | null = null;

  if (enrollment.leadId) {
    const lead = await findLeadById(workspaceId, enrollment.leadId);

    if (lead) {
      leadName = lead.fullName;
      leadEmail = lead.email;
      leadEmailConsentStatus = lead.emailConsentStatus;

      if (!lead.email) {
        warnings.push("Lead has no email address; sends will be skipped.");
      }

      if (
        lead.emailConsentStatus === "unsubscribed" ||
        lead.emailUnsubscribedAt
      ) {
        warnings.push("Lead is unsubscribed; sends will be skipped.");
      }
    }
  }

  if (enrollment.opportunityId) {
    const opportunity = await findOpportunityById(
      workspaceId,
      enrollment.opportunityId,
    );
    opportunityLabel = opportunity ? `Opportunity ${opportunity.id.slice(-6)}` : null;
  }

  return {
    ...enrollment,
    leadName,
    leadEmail,
    leadEmailConsentStatus,
    opportunityLabel,
    warnings,
  };
}

export async function listCampaignEnrollmentsForWorkspace(
  workspaceId: string,
  campaignId: string,
  filter: { status?: CampaignEnrollmentRecord["status"]; page?: number; pageSize?: number } = {},
): Promise<{ enrollments: CampaignEnrollmentDetail[]; total: number }> {
  const campaign = await findCampaignById(workspaceId, campaignId);

  if (!campaign) {
    throw new AppError("NOT_FOUND", "Campaign not found.");
  }

  const { enrollments, total } = await findCampaignEnrollments(
    workspaceId,
    campaignId,
    filter,
  );

  const enriched = await Promise.all(
    enrollments.map((enrollment) => enrichEnrollment(workspaceId, enrollment)),
  );

  return { enrollments: enriched, total };
}

export async function createCampaignEnrollmentForWorkspace(
  workspaceId: string,
  actorId: string,
  campaignId: string,
  input: CreateCampaignEnrollmentInput,
): Promise<CampaignEnrollmentDetail> {
  const campaign = await findCampaignById(workspaceId, campaignId);

  if (!campaign) {
    throw new AppError("NOT_FOUND", "Campaign not found.");
  }

  if (campaign.status === "archived") {
    throw new AppError("VALIDATION_ERROR", "Cannot enroll in an archived campaign.");
  }

  const firstStep = await findFirstCampaignStep(workspaceId, campaignId);

  if (!firstStep) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Campaign must have at least one step before enrollment.",
    );
  }

  let leadId: string | null = null;
  let opportunityId: string | null = null;

  if (campaign.audienceType === "leads") {
    if (!input.leadId || input.opportunityId) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Lead campaigns require leadId and must not include opportunityId.",
      );
    }

    const lead = await findLeadById(workspaceId, input.leadId);

    if (!lead || lead.archivedAt) {
      throw new AppError("NOT_FOUND", "Lead not found.");
    }

    const existing = await findActiveEnrollmentByLead(
      workspaceId,
      campaignId,
      input.leadId,
    );

    if (existing) {
      throw new AppError(
        "CONFLICT",
        "This lead is already actively enrolled in this campaign.",
      );
    }

    leadId = lead.id;
  } else {
    if (!input.opportunityId || input.leadId) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Opportunity campaigns require opportunityId and must not include leadId.",
      );
    }

    const opportunity = await findOpportunityById(workspaceId, input.opportunityId);

    if (!opportunity || opportunity.archivedAt) {
      throw new AppError("NOT_FOUND", "Opportunity not found.");
    }

    const existing = await findActiveEnrollmentByOpportunity(
      workspaceId,
      campaignId,
      input.opportunityId,
    );

    if (existing) {
      throw new AppError(
        "CONFLICT",
        "This opportunity is already actively enrolled in this campaign.",
      );
    }

    const lead = await findLeadById(workspaceId, opportunity.leadId);

    if (!lead || lead.archivedAt) {
      throw new AppError("NOT_FOUND", "Associated lead not found.");
    }

    opportunityId = opportunity.id;
    leadId = lead.id;
  }

  const now = new Date();
  const nextSendAt = addDays(now, firstStep.delayDays);

  const enrollment = await createCampaignEnrollment(workspaceId, {
    campaignId,
    leadId,
    opportunityId,
    currentStep: firstStep.order,
    nextSendAt,
  });

  await createAuditLog({
    workspaceId,
    actorId,
    action: "campaign_enrollment.created",
    entityType: "campaign_enrollment",
    entityId: enrollment.id,
    after: enrollmentSnapshot(enrollment),
  });

  return enrichEnrollment(workspaceId, enrollment);
}

export async function updateCampaignEnrollmentForWorkspace(
  workspaceId: string,
  actorId: string,
  campaignId: string,
  enrollmentId: string,
  input: UpdateCampaignEnrollmentInput,
): Promise<CampaignEnrollmentDetail> {
  const campaign = await findCampaignById(workspaceId, campaignId);

  if (!campaign) {
    throw new AppError("NOT_FOUND", "Campaign not found.");
  }

  const existing = await findEnrollmentById(workspaceId, campaignId, enrollmentId);

  if (!existing) {
    throw new AppError("NOT_FOUND", "Enrollment not found.");
  }

  if (!input.status) {
    return enrichEnrollment(workspaceId, existing);
  }

  if (existing.status !== "active" && existing.status !== "paused") {
    throw new AppError(
      "VALIDATION_ERROR",
      "Only active or paused enrollments can be updated.",
    );
  }

  const updated = await updateCampaignEnrollment(workspaceId, enrollmentId, {
    status: input.status,
  });

  if (!updated) {
    throw new AppError("NOT_FOUND", "Enrollment not found.");
  }

  await createAuditLog({
    workspaceId,
    actorId,
    action:
      input.status === "paused"
        ? "campaign_enrollment.paused"
        : "campaign_enrollment.resumed",
    entityType: "campaign_enrollment",
    entityId: updated.id,
    before: enrollmentSnapshot(existing),
    after: enrollmentSnapshot(updated),
  });

  return enrichEnrollment(workspaceId, updated);
}

export async function pauseCampaignEnrollmentForWorkspace(
  workspaceId: string,
  actorId: string,
  campaignId: string,
  enrollmentId: string,
): Promise<CampaignEnrollmentDetail> {
  return updateCampaignEnrollmentForWorkspace(
    workspaceId,
    actorId,
    campaignId,
    enrollmentId,
    { status: "paused" },
  );
}

export async function resumeCampaignEnrollmentForWorkspace(
  workspaceId: string,
  actorId: string,
  campaignId: string,
  enrollmentId: string,
): Promise<CampaignEnrollmentDetail> {
  return updateCampaignEnrollmentForWorkspace(
    workspaceId,
    actorId,
    campaignId,
    enrollmentId,
    { status: "active" },
  );
}
