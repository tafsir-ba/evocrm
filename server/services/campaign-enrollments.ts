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
  findNonTerminalEnrollmentTargetIds,
  updateCampaignEnrollment,
  type CampaignEnrollmentRecord,
} from "@/server/repositories/campaign-enrollments";
import { findLeads } from "@/server/repositories/leads";
import { findFirstCampaignStep, findCampaignSteps } from "@/server/repositories/campaign-steps";
import { findCampaignById } from "@/server/repositories/campaigns";
import { listOpportunitiesForWorkspace } from "@/server/services/opportunities";
import { findWorkspaceById } from "@/server/repositories/workspaces";
import { findStepByOrder } from "@/server/repositories/campaign-steps";
import { sendCampaignEnrollmentsImmediately } from "@/server/services/campaign-sending";
import { computeNextSendAt, computeRescheduledSendAt } from "@/server/utils/campaign-schedule";
import {
  buildEnrollmentScheduledSteps,
  type EnrollmentScheduledStep,
} from "@/server/utils/campaign-enrollment-schedule";
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
  scheduledSteps: EnrollmentScheduledStep[];
};

export type CampaignEnrollmentLeadCandidate = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  emailConsentStatus: string;
  createdAt: Date;
};

export type CampaignEnrollmentOpportunityCandidate = {
  id: string;
  createdAt: Date;
  lead: { id: string; fullName: string; email: string | null } | null;
  property: { id: string; title: string; reference: string | null } | null;
  status: { label: string } | null;
};

export type CampaignEnrollmentCandidate =
  | ({ audienceType: "leads" } & CampaignEnrollmentLeadCandidate)
  | ({ audienceType: "opportunities" } & CampaignEnrollmentOpportunityCandidate);

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

async function enrichEnrollmentWithCampaignSteps(
  workspaceId: string,
  campaignId: string,
  enrollment: CampaignEnrollmentRecord,
): Promise<CampaignEnrollmentDetail> {
  const [steps, timeZone] = await Promise.all([
    findCampaignSteps(workspaceId, campaignId),
    getWorkspaceTimeZone(workspaceId),
  ]);
  return enrichEnrollment(workspaceId, enrollment, steps, timeZone);
}

async function enrichEnrollment(
  workspaceId: string,
  enrollment: CampaignEnrollmentRecord,
  steps: Array<{ order: number; delayDays: number; sendTime: string; subject: string }> = [],
  timeZone = "UTC",
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
    scheduledSteps: buildEnrollmentScheduledSteps(enrollment, steps, timeZone),
  };
}

async function getWorkspaceTimeZone(workspaceId: string): Promise<string> {
  const workspace = await findWorkspaceById(workspaceId);
  return workspace?.timezone ?? "UTC";
}

export async function listEnrollmentCandidatesForWorkspace(
  workspaceId: string,
  campaignId: string,
  filter: { page?: number; pageSize?: number; search?: string } = {},
): Promise<{ candidates: CampaignEnrollmentCandidate[]; total: number }> {
  const campaign = await findCampaignById(workspaceId, campaignId);

  if (!campaign) {
    throw new AppError("NOT_FOUND", "Campaign not found.");
  }

  if (campaign.status === "archived") {
    return { candidates: [], total: 0 };
  }

  const { leadIds, opportunityIds } = await findNonTerminalEnrollmentTargetIds(
    workspaceId,
    campaignId,
  );
  const page = filter.page ?? 1;
  const pageSize = filter.pageSize ?? 50;

  if (campaign.audienceType === "leads") {
    const { leads, total } = await findLeads(workspaceId, {
      search: filter.search,
      excludeIds: leadIds,
      page,
      pageSize,
    });

    return {
      candidates: leads.map((lead) => ({
        audienceType: "leads" as const,
        id: lead.id,
        fullName: lead.fullName,
        email: lead.email,
        phone: lead.phone,
        emailConsentStatus: lead.emailConsentStatus,
        createdAt: lead.createdAt,
      })),
      total,
    };
  }

  const { opportunities, total } = await listOpportunitiesForWorkspace(workspaceId, {
    search: filter.search,
    excludeIds: opportunityIds,
    page,
    pageSize,
  });

  return {
    candidates: opportunities.map((opportunity) => ({
      audienceType: "opportunities" as const,
      id: opportunity.id,
      createdAt: opportunity.createdAt,
      lead: opportunity.lead
        ? {
            id: opportunity.lead.id,
            fullName: opportunity.lead.fullName,
            email: opportunity.lead.email,
          }
        : null,
      property: opportunity.property
        ? {
            id: opportunity.property.id,
            title: opportunity.property.title,
            reference: opportunity.property.reference,
          }
        : null,
      status: opportunity.status ? { label: opportunity.status.label } : null,
    })),
    total,
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

  const [steps, timeZone] = await Promise.all([
    findCampaignSteps(workspaceId, campaignId),
    getWorkspaceTimeZone(workspaceId),
  ]);

  const enriched = await Promise.all(
    enrollments.map((enrollment) => enrichEnrollment(workspaceId, enrollment, steps, timeZone)),
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

  if (campaign.status !== "active") {
    throw new AppError(
      "VALIDATION_ERROR",
      "Campaign must be active before enrolling recipients.",
    );
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
  const workspace = await findWorkspaceById(workspaceId);
  const timeZone = workspace?.timezone ?? "UTC";
  const nextSendAt = computeNextSendAt(now, firstStep.delayDays, {
    sendTime: firstStep.sendTime,
    timeZone,
  });

  const enrollment = await createCampaignEnrollment(workspaceId, {
    campaignId,
    leadId,
    opportunityId,
    projectId: leadId ? (await findLeadById(workspaceId, leadId))?.projectId ?? null : null,
    enrollmentSource: "manual",
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

  if (campaign.status === "active" && firstStep.delayDays <= 0) {
    void sendCampaignEnrollmentsImmediately(
      workspaceId,
      campaignId,
      "enrollment",
      [enrollment.id],
    ).catch(() => undefined);
  }

  return enrichEnrollmentWithCampaignSteps(workspaceId, campaignId, enrollment);
}

export async function enrollLeadInCampaignWithContext(input: {
  workspaceId: string;
  campaignId: string;
  leadId: string;
  actorId: string;
  projectId?: string | null;
  enrollmentSource: "manual" | "project_auto_enroll" | "rule_based_auto_enrollment";
  enrollmentReason?: Record<string, unknown> | null;
}): Promise<CampaignEnrollmentDetail | null> {
  const campaign = await findCampaignById(input.workspaceId, input.campaignId);

  if (!campaign || campaign.status !== "active" || campaign.archivedAt) {
    return null;
  }

  if (campaign.audienceType !== "leads") {
    return null;
  }

  const lead = await findLeadById(input.workspaceId, input.leadId);

  if (!lead || lead.archivedAt) {
    return null;
  }

  const existing = await findActiveEnrollmentByLead(
    input.workspaceId,
    input.campaignId,
    input.leadId,
  );

  if (existing) {
    return null;
  }

  const firstStep = await findFirstCampaignStep(input.workspaceId, input.campaignId);

  if (!firstStep) {
    return null;
  }

  const now = new Date();
  const workspace = await findWorkspaceById(input.workspaceId);
  const timeZone = workspace?.timezone ?? "UTC";
  const nextSendAt = computeNextSendAt(now, firstStep.delayDays, {
    sendTime: firstStep.sendTime,
    timeZone,
  });

  const enrollment = await createCampaignEnrollment(input.workspaceId, {
    campaignId: input.campaignId,
    leadId: input.leadId,
    opportunityId: null,
    projectId: input.projectId ?? lead.projectId,
    enrollmentSource: input.enrollmentSource,
    enrollmentReason: input.enrollmentReason ?? null,
    currentStep: firstStep.order,
    nextSendAt,
  });

  await createAuditLog({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: "campaign_enrollment.created",
    entityType: "campaign_enrollment",
    entityId: enrollment.id,
    after: {
      ...enrollmentSnapshot(enrollment),
      enrollmentSource: input.enrollmentSource,
      enrollmentReason: input.enrollmentReason ?? null,
    },
  });

  if (firstStep.delayDays <= 0) {
    void sendCampaignEnrollmentsImmediately(
      input.workspaceId,
      input.campaignId,
      "enrollment",
      [enrollment.id],
    ).catch(() => undefined);
  }

  return enrichEnrollmentWithCampaignSteps(
    input.workspaceId,
    input.campaignId,
    enrollment,
  );
}

export async function rescheduleActiveEnrollmentSendsForCampaign(
  workspaceId: string,
  campaignId: string,
  anchor: Date,
  mode: "activation" | "resume",
): Promise<string[]> {
  const workspace = await findWorkspaceById(workspaceId);
  const timeZone = workspace?.timezone ?? "UTC";
  const { enrollments } = await findCampaignEnrollments(workspaceId, campaignId, {
    status: "active",
    pageSize: 500,
  });

  const updatedIds: string[] = [];

  for (const enrollment of enrollments) {
    if (mode === "activation" && enrollment.lastSentAt !== null) {
      continue;
    }

    if (mode === "resume" && enrollment.nextSendAt > anchor) {
      continue;
    }

    const step = await findStepByOrder(workspaceId, campaignId, enrollment.currentStep);

    if (!step) {
      continue;
    }

    await updateCampaignEnrollment(workspaceId, enrollment.id, {
      nextSendAt: computeRescheduledSendAt(anchor, step.delayDays, {
        overdue: mode === "resume" && enrollment.nextSendAt <= anchor,
        sendTime: step.sendTime,
        timeZone,
      }),
    });
    updatedIds.push(enrollment.id);
  }

  return updatedIds;
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
    return enrichEnrollmentWithCampaignSteps(workspaceId, campaignId, existing);
  }

  if (existing.status !== "active" && existing.status !== "paused") {
    throw new AppError(
      "VALIDATION_ERROR",
      "Only active or paused enrollments can be updated.",
    );
  }

  let updated = await updateCampaignEnrollment(workspaceId, enrollmentId, {
    status: input.status,
  });

  if (!updated) {
    throw new AppError("NOT_FOUND", "Enrollment not found.");
  }

  if (
    input.status === "active" &&
    existing.status === "paused" &&
    campaign.status === "active" &&
    existing.nextSendAt <= new Date()
  ) {
    const anchor = new Date();
    const step = await findStepByOrder(workspaceId, campaignId, existing.currentStep);

    if (step) {
      const workspace = await findWorkspaceById(workspaceId);
      const timeZone = workspace?.timezone ?? "UTC";
      const rescheduled = await updateCampaignEnrollment(workspaceId, enrollmentId, {
        nextSendAt: computeRescheduledSendAt(anchor, step.delayDays, {
          overdue: true,
          sendTime: step.sendTime,
          timeZone,
        }),
      });

      if (rescheduled) {
        updated = rescheduled;
        void sendCampaignEnrollmentsImmediately(
          workspaceId,
          campaignId,
          "resume",
          [rescheduled.id],
        ).catch(() => undefined);
      }
    }
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

  return enrichEnrollmentWithCampaignSteps(workspaceId, campaignId, updated);
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
