import "server-only";

import {
  CAMPAIGN_GUARD_BLOCK_REASON,
  isAutomaticEnrollmentSource,
  isBlockedFromAutomaticCampaignEnrollment,
} from "@/lib/campaign-enrollment-guard";
import { createAuditLog } from "@/server/audit/create-audit-log";
import { AppError } from "@/server/errors";
import { findLeadById } from "@/server/repositories/leads";
import { findOpportunityById } from "@/server/repositories/opportunities";
import {
  createCampaignEnrollment,
  DuplicateCampaignEnrollmentError,
  findActiveEnrollmentByLead,
  findActiveEnrollmentByOpportunity,
  findCampaignEnrollments,
  findEnrollmentById,
  findNonTerminalEnrollmentTargetIds,
  listAllCampaignEnrollments,
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
import { reconcileEnrollmentWithSendLogs } from "@/server/services/campaign-enrollment-reconcile";
import { findCampaignSendsByEnrollmentIds } from "@/server/repositories/campaign-sends";
import {
  computeNextSendAt,
  computeRescheduledSendAt,
  isCampaignOrderOverdue,
} from "@/server/utils/campaign-schedule";
import {
  buildEnrollmentScheduledSteps,
  computeEnrollmentNextSendAt,
  enrollmentHasDeferredRetry,
  mapLatestSendLogsByStepOrder,
  type CampaignStepScheduleInput,
  type EnrollmentScheduledStep,
  type EnrollmentStepSendLog,
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
  const stepInputs: CampaignStepScheduleInput[] = steps.map((step) => ({
    id: step.id,
    order: step.order,
    delayDays: step.delayDays,
    sendTime: step.sendTime,
    subject: step.subject,
  }));
  const sends = await findCampaignSendsByEnrollmentIds(workspaceId, [enrollment.id]);

  return enrichEnrollment(
    workspaceId,
    enrollment,
    stepInputs,
    timeZone,
    mapLatestSendLogsByStepOrder(stepInputs, sends),
  );
}

async function syncEnrollmentNextSendAtIfNeeded(
  workspaceId: string,
  enrollment: CampaignEnrollmentRecord,
  steps: Array<{ order: number; delayDays: number; sendTime: string; subject: string }>,
  timeZone: string,
  sendLogsByStepOrder: Map<number, EnrollmentStepSendLog> = new Map(),
): Promise<CampaignEnrollmentRecord> {
  if (enrollment.status !== "active" && enrollment.status !== "paused") {
    return enrollment;
  }

  const currentStep = steps.find((step) => step.order === enrollment.currentStep);

  if (!currentStep) {
    return enrollment;
  }

  // Failure/skip retries intentionally bump nextSendAt. Passive list/detail loads
  // must not collapse that backoff back to the step's projected order time.
  if (enrollmentHasDeferredRetry(enrollment, sendLogsByStepOrder)) {
    return enrollment;
  }

  const projectedNextSendAt = computeEnrollmentNextSendAt(
    enrollment,
    currentStep,
    timeZone,
  );

  if (projectedNextSendAt.getTime() >= enrollment.nextSendAt.getTime()) {
    return enrollment;
  }

  // Keep an already-due pickup time stable on passive list loads.
  if (enrollment.lastSentAt === null && enrollment.nextSendAt <= new Date()) {
    return enrollment;
  }

  const updated = await updateCampaignEnrollment(workspaceId, enrollment.id, {
    nextSendAt: projectedNextSendAt,
  });

  return updated ?? enrollment;
}

async function enrichEnrollment(
  workspaceId: string,
  enrollment: CampaignEnrollmentRecord,
  steps: CampaignStepScheduleInput[] = [],
  timeZone = "UTC",
  sendLogsByStepOrder: Map<number, EnrollmentStepSendLog> = new Map(),
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

  const syncedEnrollment = await syncEnrollmentNextSendAtIfNeeded(
    workspaceId,
    await reconcileEnrollmentWithSendLogs(
      workspaceId,
      enrollment,
      steps,
      sendLogsByStepOrder,
      timeZone,
    ),
    steps,
    timeZone,
    sendLogsByStepOrder,
  );

  return {
    ...syncedEnrollment,
    leadName,
    leadEmail,
    leadEmailConsentStatus,
    opportunityLabel,
    warnings,
    scheduledSteps: buildEnrollmentScheduledSteps(
      syncedEnrollment,
      steps,
      sendLogsByStepOrder,
      timeZone,
    ),
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

  const stepInputs: CampaignStepScheduleInput[] = steps.map((step) => ({
    id: step.id,
    order: step.order,
    delayDays: step.delayDays,
    sendTime: step.sendTime,
    subject: step.subject,
  }));

  const sends = await findCampaignSendsByEnrollmentIds(
    workspaceId,
    enrollments.map((enrollment) => enrollment.id),
  );
  const sendsByEnrollmentId = new Map<string, typeof sends>();

  for (const send of sends) {
    const existing = sendsByEnrollmentId.get(send.enrollmentId) ?? [];
    existing.push(send);
    sendsByEnrollmentId.set(send.enrollmentId, existing);
  }

  const enriched = await Promise.all(
    enrollments.map((enrollment) =>
      enrichEnrollment(
        workspaceId,
        enrollment,
        stepInputs,
        timeZone,
        mapLatestSendLogsByStepOrder(
          stepInputs,
          sendsByEnrollmentId.get(enrollment.id) ?? [],
        ),
      ),
    ),
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
  }).catch((error) => {
    if (error instanceof DuplicateCampaignEnrollmentError) {
      throw new AppError(
        "CONFLICT",
        campaign.audienceType === "leads"
          ? "This lead is already actively enrolled in this campaign."
          : "This opportunity is already actively enrolled in this campaign.",
      );
    }

    throw error;
  });

  await createAuditLog({
    workspaceId,
    actorId,
    action: "campaign_enrollment.created",
    entityType: "campaign_enrollment",
    entityId: enrollment.id,
    after: enrollmentSnapshot(enrollment),
  });

  if (campaign.status === "active" && enrollment.nextSendAt <= new Date()) {
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

  if (
    isAutomaticEnrollmentSource(input.enrollmentSource) &&
    isBlockedFromAutomaticCampaignEnrollment(lead.attributes)
  ) {
    await createAuditLog({
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: "campaign.auto_enrollment_skipped",
      entityType: "lead",
      entityId: lead.id,
      after: {
        campaignId: input.campaignId,
        enrollmentSource: input.enrollmentSource,
        reason: CAMPAIGN_GUARD_BLOCK_REASON,
      },
    });
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

  let enrollment: CampaignEnrollmentRecord;

  try {
    enrollment = await createCampaignEnrollment(input.workspaceId, {
      campaignId: input.campaignId,
      leadId: input.leadId,
      opportunityId: null,
      projectId: input.projectId ?? lead.projectId,
      enrollmentSource: input.enrollmentSource,
      enrollmentReason: input.enrollmentReason ?? null,
      currentStep: firstStep.order,
      nextSendAt,
    });
  } catch (error) {
    if (error instanceof DuplicateCampaignEnrollmentError) {
      return null;
    }

    throw error;
  }

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

  if (enrollment.nextSendAt <= new Date()) {
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
  const enrollments = await listAllCampaignEnrollments(workspaceId, campaignId, {
    status: "active",
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

    const scheduleAnchor = enrollment.lastSentAt ?? enrollment.createdAt;
    const overdue = isCampaignOrderOverdue(scheduleAnchor, anchor, step.delayDays, {
      sendTime: step.sendTime,
      timeZone,
    });

    await updateCampaignEnrollment(workspaceId, enrollment.id, {
      nextSendAt: computeRescheduledSendAt(anchor, step.delayDays, {
        overdue,
        sendTime: step.sendTime,
        timeZone,
      }),
    });
    updatedIds.push(enrollment.id);
  }

  return updatedIds;
}

export async function rescheduleEnrollmentsForCampaignSchedule(
  workspaceId: string,
  campaignId: string,
): Promise<string[]> {
  const workspace = await findWorkspaceById(workspaceId);
  const timeZone = workspace?.timezone ?? "UTC";
  const steps = await findCampaignSteps(workspaceId, campaignId);
  const stepInputs: CampaignStepScheduleInput[] = steps.map((step) => ({
    id: step.id,
    order: step.order,
    delayDays: step.delayDays,
    sendTime: step.sendTime,
    subject: step.subject,
  }));
  const enrollments = [
    ...(await listAllCampaignEnrollments(workspaceId, campaignId, { status: "active" })),
    ...(await listAllCampaignEnrollments(workspaceId, campaignId, { status: "paused" })),
    ...(await listAllCampaignEnrollments(workspaceId, campaignId, { status: "completed" })),
  ];

  const sends = await findCampaignSendsByEnrollmentIds(
    workspaceId,
    enrollments.map((enrollment) => enrollment.id),
  );

  const updatedIds: string[] = [];
  const now = new Date();

  for (const enrollment of enrollments) {
    const enrollmentSends = sends.filter((send) => send.enrollmentId === enrollment.id);
    const sendLogs = mapLatestSendLogsByStepOrder(stepInputs, enrollmentSends);
    const reconciled = await reconcileEnrollmentWithSendLogs(
      workspaceId,
      enrollment,
      stepInputs,
      sendLogs,
      timeZone,
    );

    if (reconciled.id !== enrollment.id || reconciled.status !== enrollment.status) {
      updatedIds.push(reconciled.id);
    }

    if (reconciled.status !== "active" && reconciled.status !== "paused") {
      continue;
    }

    const step = steps.find((item) => item.order === reconciled.currentStep);

    if (!step) {
      continue;
    }

    const nextSendAt = computeEnrollmentNextSendAt(reconciled, step, timeZone, now);

    if (nextSendAt.getTime() === reconciled.nextSendAt.getTime()) {
      continue;
    }

    await updateCampaignEnrollment(workspaceId, reconciled.id, { nextSendAt });
    updatedIds.push(reconciled.id);
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
