import "server-only";

import { connectDb } from "@/server/db/mongoose";
import {
  CampaignEnrollmentModel,
  type CampaignEnrollmentDocument,
} from "@/models/campaign-enrollment";
import { withWorkspaceScope } from "@/server/workspaces/with-workspace-scope";

export type CampaignEnrollmentRecord = {
  id: string;
  workspaceId: string;
  campaignId: string;
  leadId: string | null;
  opportunityId: string | null;
  projectId: string | null;
  enrollmentSource: "manual" | "project_auto_enroll" | "rule_based_auto_enrollment";
  enrollmentReason: Record<string, unknown> | null;
  status: "active" | "paused" | "completed" | "unsubscribed" | "failed";
  currentStep: number;
  nextSendAt: Date;
  lastSentAt: Date | null;
  completedAt: Date | null;
  unsubscribedAt: Date | null;
  failedAt: Date | null;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function toEnrollmentRecord(
  document: CampaignEnrollmentDocument,
): CampaignEnrollmentRecord {
  return {
    id: document._id.toString(),
    workspaceId: document.workspaceId.toString(),
    campaignId: document.campaignId.toString(),
    leadId: document.leadId?.toString() ?? null,
    opportunityId: document.opportunityId?.toString() ?? null,
    projectId: document.projectId?.toString() ?? null,
    enrollmentSource:
      (document.enrollmentSource as CampaignEnrollmentRecord["enrollmentSource"]) ??
      "manual",
    enrollmentReason:
      (document.enrollmentReason as Record<string, unknown> | null) ?? null,
    status: document.status as CampaignEnrollmentRecord["status"],
    currentStep: document.currentStep,
    nextSendAt: document.nextSendAt,
    lastSentAt: document.lastSentAt ?? null,
    completedAt: document.completedAt ?? null,
    unsubscribedAt: document.unsubscribedAt ?? null,
    failedAt: document.failedAt ?? null,
    failureReason: document.failureReason ?? null,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export const NON_TERMINAL_ENROLLMENT_STATUSES = ["active", "paused"] as const;

export type CampaignEnrollmentListFilter = {
  status?: CampaignEnrollmentRecord["status"];
  page?: number;
  pageSize?: number;
};

export async function findCampaignEnrollments(
  workspaceId: string,
  campaignId: string,
  filter: CampaignEnrollmentListFilter = {},
): Promise<{ enrollments: CampaignEnrollmentRecord[]; total: number }> {
  await connectDb();

  const query: Record<string, unknown> = { campaignId };

  if (filter.status) {
    query.status = filter.status;
  }

  const scoped = withWorkspaceScope(workspaceId, query);
  const page = filter.page ?? 1;
  const pageSize = filter.pageSize ?? 25;
  const skip = (page - 1) * pageSize;

  const [enrollments, total] = await Promise.all([
    CampaignEnrollmentModel.find(scoped)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean(),
    CampaignEnrollmentModel.countDocuments(scoped),
  ]);

  return {
    enrollments: enrollments.map((doc) =>
      toEnrollmentRecord(doc as CampaignEnrollmentDocument),
    ),
    total,
  };
}

export async function findEnrollmentById(
  workspaceId: string,
  campaignId: string,
  enrollmentId: string,
): Promise<CampaignEnrollmentRecord | null> {
  await connectDb();

  const document = await CampaignEnrollmentModel.findOne(
    withWorkspaceScope(workspaceId, { _id: enrollmentId, campaignId }),
  ).lean();

  return document ? toEnrollmentRecord(document as CampaignEnrollmentDocument) : null;
}

export async function findActiveEnrollmentByLead(
  workspaceId: string,
  campaignId: string,
  leadId: string,
): Promise<CampaignEnrollmentRecord | null> {
  await connectDb();

  const document = await CampaignEnrollmentModel.findOne(
    withWorkspaceScope(workspaceId, {
      campaignId,
      leadId,
      status: { $in: NON_TERMINAL_ENROLLMENT_STATUSES },
    }),
  ).lean();

  return document ? toEnrollmentRecord(document as CampaignEnrollmentDocument) : null;
}

export async function findActiveEnrollmentByOpportunity(
  workspaceId: string,
  campaignId: string,
  opportunityId: string,
): Promise<CampaignEnrollmentRecord | null> {
  await connectDb();

  const document = await CampaignEnrollmentModel.findOne(
    withWorkspaceScope(workspaceId, {
      campaignId,
      opportunityId,
      status: { $in: NON_TERMINAL_ENROLLMENT_STATUSES },
    }),
  ).lean();

  return document ? toEnrollmentRecord(document as CampaignEnrollmentDocument) : null;
}

export async function findNonTerminalEnrollmentTargetIds(
  workspaceId: string,
  campaignId: string,
): Promise<{ leadIds: string[]; opportunityIds: string[] }> {
  await connectDb();

  const enrollments = await CampaignEnrollmentModel.find(
    withWorkspaceScope(workspaceId, {
      campaignId,
      status: { $in: NON_TERMINAL_ENROLLMENT_STATUSES },
    }),
  )
    .select({ leadId: 1, opportunityId: 1 })
    .lean<Array<{ leadId?: { toString(): string }; opportunityId?: { toString(): string } }>>();

  const leadIds = new Set<string>();
  const opportunityIds = new Set<string>();

  for (const enrollment of enrollments) {
    if (enrollment.leadId) {
      leadIds.add(enrollment.leadId.toString());
    }
    if (enrollment.opportunityId) {
      opportunityIds.add(enrollment.opportunityId.toString());
    }
  }

  return {
    leadIds: Array.from(leadIds),
    opportunityIds: Array.from(opportunityIds),
  };
}

export async function countCampaignEnrollments(
  workspaceId: string,
  campaignId: string,
): Promise<number> {
  await connectDb();

  return CampaignEnrollmentModel.countDocuments(
    withWorkspaceScope(workspaceId, { campaignId }),
  );
}

export type CreateEnrollmentInput = {
  campaignId: string;
  leadId?: string | null;
  opportunityId?: string | null;
  projectId?: string | null;
  enrollmentSource?: CampaignEnrollmentRecord["enrollmentSource"];
  enrollmentReason?: Record<string, unknown> | null;
  currentStep: number;
  nextSendAt: Date;
};

export async function createCampaignEnrollment(
  workspaceId: string,
  input: CreateEnrollmentInput,
): Promise<CampaignEnrollmentRecord> {
  await connectDb();

  const document = await CampaignEnrollmentModel.create({
    workspaceId,
    campaignId: input.campaignId,
    leadId: input.leadId ?? null,
    opportunityId: input.opportunityId ?? null,
    projectId: input.projectId ?? null,
    enrollmentSource: input.enrollmentSource ?? "manual",
    enrollmentReason: input.enrollmentReason ?? null,
    status: "active",
    currentStep: input.currentStep,
    nextSendAt: input.nextSendAt,
    lastSentAt: null,
    completedAt: null,
    unsubscribedAt: null,
    failedAt: null,
    failureReason: null,
  });

  return toEnrollmentRecord(document.toObject() as CampaignEnrollmentDocument);
}

export async function updateCampaignEnrollment(
  workspaceId: string,
  enrollmentId: string,
  input: Partial<{
    status: CampaignEnrollmentRecord["status"];
    currentStep: number;
    nextSendAt: Date;
    lastSentAt: Date | null;
    completedAt: Date | null;
    unsubscribedAt: Date | null;
    failedAt: Date | null;
    failureReason: string | null;
  }>,
): Promise<CampaignEnrollmentRecord | null> {
  await connectDb();

  const document = await CampaignEnrollmentModel.findOneAndUpdate(
    withWorkspaceScope(workspaceId, { _id: enrollmentId }),
    { $set: input },
    { new: true },
  ).lean();

  return document ? toEnrollmentRecord(document as CampaignEnrollmentDocument) : null;
}

export async function pauseEnrollmentsForCampaign(
  workspaceId: string,
  campaignId: string,
): Promise<number> {
  await connectDb();

  const result = await CampaignEnrollmentModel.updateMany(
    withWorkspaceScope(workspaceId, {
      campaignId,
      status: "active",
    }),
    { $set: { status: "paused" } },
  );

  return result.modifiedCount;
}

export async function resumeEnrollmentsForCampaign(
  workspaceId: string,
  campaignId: string,
): Promise<number> {
  await connectDb();

  const result = await CampaignEnrollmentModel.updateMany(
    withWorkspaceScope(workspaceId, {
      campaignId,
      status: "paused",
    }),
    { $set: { status: "active" } },
  );

  return result.modifiedCount;
}

export async function cancelEnrollmentsForCampaign(
  workspaceId: string,
  campaignId: string,
  reason: string,
): Promise<number> {
  await connectDb();

  const now = new Date();
  const result = await CampaignEnrollmentModel.updateMany(
    withWorkspaceScope(workspaceId, {
      campaignId,
      status: { $in: NON_TERMINAL_ENROLLMENT_STATUSES },
    }),
    {
      $set: {
        status: "failed",
        failedAt: now,
        failureReason: reason,
      },
    },
  );

  return result.modifiedCount;
}

export async function findDueEnrollments(
  limit: number,
): Promise<CampaignEnrollmentRecord[]> {
  await connectDb();

  const now = new Date();
  const documents = await CampaignEnrollmentModel.find({
    status: "active",
    nextSendAt: { $lte: now },
  })
    .sort({ nextSendAt: 1 })
    .limit(limit)
    .lean();

  return documents.map((doc) => toEnrollmentRecord(doc as CampaignEnrollmentDocument));
}

export async function findEnrollmentByIdOnly(
  workspaceId: string,
  enrollmentId: string,
): Promise<CampaignEnrollmentRecord | null> {
  await connectDb();

  const document = await CampaignEnrollmentModel.findOne(
    withWorkspaceScope(workspaceId, { _id: enrollmentId }),
  ).lean();

  return document ? toEnrollmentRecord(document as CampaignEnrollmentDocument) : null;
}
