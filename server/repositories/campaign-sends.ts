import "server-only";

import { connectDb } from "@/server/db/mongoose";
import { CampaignSendModel, type CampaignSendDocument } from "@/models/campaign-send";
import { withWorkspaceScope } from "@/server/workspaces/with-workspace-scope";

export type CampaignSendRecord = {
  id: string;
  workspaceId: string;
  campaignId: string;
  campaignStepId: string;
  enrollmentId: string;
  leadId: string | null;
  opportunityId: string | null;
  status: "queued" | "sent" | "failed" | "skipped";
  providerMessageId: string | null;
  error: string | null;
  scheduledFor: Date;
  sentAt: Date | null;
  deliveredAt: Date | null;
  firstOpenedAt: Date | null;
  firstClickedAt: Date | null;
  bouncedAt: Date | null;
  complainedAt: Date | null;
  deliveryDelayedAt: Date | null;
  providerFailedAt: Date | null;
  providerError: string | null;
  lastProviderEventAt: Date | null;
  createdAt: Date;
};

function toCampaignSendRecord(document: CampaignSendDocument): CampaignSendRecord {
  return {
    id: document._id.toString(),
    workspaceId: document.workspaceId.toString(),
    campaignId: document.campaignId.toString(),
    campaignStepId: document.campaignStepId.toString(),
    enrollmentId: document.enrollmentId.toString(),
    leadId: document.leadId?.toString() ?? null,
    opportunityId: document.opportunityId?.toString() ?? null,
    status: document.status as CampaignSendRecord["status"],
    providerMessageId: document.providerMessageId ?? null,
    error: document.error ?? null,
    scheduledFor: document.scheduledFor,
    sentAt: document.sentAt ?? null,
    deliveredAt: document.deliveredAt ?? null,
    firstOpenedAt: document.firstOpenedAt ?? null,
    firstClickedAt: document.firstClickedAt ?? null,
    bouncedAt: document.bouncedAt ?? null,
    complainedAt: document.complainedAt ?? null,
    deliveryDelayedAt: document.deliveryDelayedAt ?? null,
    providerFailedAt: document.providerFailedAt ?? null,
    providerError: document.providerError ?? null,
    lastProviderEventAt: document.lastProviderEventAt ?? null,
    createdAt: document.createdAt,
  };
}

export type CampaignSendListFilter = {
  status?: CampaignSendRecord["status"];
  page?: number;
  pageSize?: number;
};

export async function findCampaignSends(
  workspaceId: string,
  campaignId: string,
  filter: CampaignSendListFilter = {},
): Promise<{ sends: CampaignSendRecord[]; total: number }> {
  await connectDb();

  const query: Record<string, unknown> = { campaignId };

  if (filter.status) {
    query.status = filter.status;
  }

  const scoped = withWorkspaceScope(workspaceId, query);
  const page = filter.page ?? 1;
  const pageSize = filter.pageSize ?? 50;
  const skip = (page - 1) * pageSize;

  const [sends, total] = await Promise.all([
    CampaignSendModel.find(scoped)
      .sort({ scheduledFor: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean(),
    CampaignSendModel.countDocuments(scoped),
  ]);

  return {
    sends: sends.map((doc) => toCampaignSendRecord(doc as CampaignSendDocument)),
    total,
  };
}

export type CreateCampaignSendInput = {
  campaignId: string;
  campaignStepId: string;
  enrollmentId: string;
  leadId?: string | null;
  opportunityId?: string | null;
  status: CampaignSendRecord["status"];
  providerMessageId?: string | null;
  error?: string | null;
  scheduledFor: Date;
  sentAt?: Date | null;
};

export async function createCampaignSend(
  workspaceId: string,
  input: CreateCampaignSendInput,
): Promise<CampaignSendRecord> {
  await connectDb();

  const document = await CampaignSendModel.create({
    workspaceId,
    campaignId: input.campaignId,
    campaignStepId: input.campaignStepId,
    enrollmentId: input.enrollmentId,
    leadId: input.leadId ?? null,
    opportunityId: input.opportunityId ?? null,
    status: input.status,
    providerMessageId: input.providerMessageId ?? null,
    error: input.error ?? null,
    scheduledFor: input.scheduledFor,
    sentAt: input.sentAt ?? null,
  });

  return toCampaignSendRecord(document.toObject() as CampaignSendDocument);
}

export async function findCampaignSendByProviderMessageId(
  providerMessageId: string,
): Promise<CampaignSendRecord | null> {
  await connectDb();

  const document = await CampaignSendModel.findOne({ providerMessageId }).lean();

  return document ? toCampaignSendRecord(document as CampaignSendDocument) : null;
}

export async function findCampaignSendsByEnrollmentIds(
  workspaceId: string,
  enrollmentIds: string[],
): Promise<CampaignSendRecord[]> {
  if (enrollmentIds.length === 0) {
    return [];
  }

  await connectDb();

  const documents = await CampaignSendModel.find(
    withWorkspaceScope(workspaceId, {
      enrollmentId: { $in: enrollmentIds },
    }),
  )
    .sort({ createdAt: -1 })
    .lean();

  return documents.map((doc) => toCampaignSendRecord(doc as CampaignSendDocument));
}

export async function findSentCampaignSendForEnrollmentStep(
  workspaceId: string,
  enrollmentId: string,
  campaignStepId: string,
): Promise<CampaignSendRecord | null> {
  await connectDb();

  const document = await CampaignSendModel.findOne(
    withWorkspaceScope(workspaceId, {
      enrollmentId,
      campaignStepId,
      status: "sent",
    }),
  ).lean();

  return document ? toCampaignSendRecord(document as CampaignSendDocument) : null;
}

export type CampaignSendProviderEventType =
  | "delivered"
  | "bounced"
  | "complained"
  | "opened"
  | "clicked"
  | "delivery_delayed"
  | "failed"
  | "sent";

/**
 * Apply first-touch provider lifecycle timestamps. Safe to call repeatedly —
 * first non-null timestamp wins per field.
 */
export async function applyCampaignSendProviderEvent(
  workspaceId: string,
  sendId: string,
  eventType: CampaignSendProviderEventType,
  eventTimestamp: Date,
  providerError?: string | null,
): Promise<void> {
  await connectDb();

  const firstTouchField: Partial<Record<CampaignSendProviderEventType, string>> = {
    delivered: "deliveredAt",
    opened: "firstOpenedAt",
    clicked: "firstClickedAt",
    bounced: "bouncedAt",
    complained: "complainedAt",
    delivery_delayed: "deliveryDelayedAt",
    failed: "providerFailedAt",
  };

  const field = firstTouchField[eventType];
  const sharedSet: Record<string, unknown> = {
    lastProviderEventAt: eventTimestamp,
  };

  if (
    providerError &&
    (eventType === "failed" || eventType === "bounced")
  ) {
    sharedSet.providerError = providerError;
  }

  if (field) {
    await CampaignSendModel.updateOne(
      withWorkspaceScope(workspaceId, { _id: sendId, [field]: null }),
      { $set: { ...sharedSet, [field]: eventTimestamp } },
    );
  }

  await CampaignSendModel.updateOne(withWorkspaceScope(workspaceId, { _id: sendId }), {
    $set: sharedSet,
  });
}
