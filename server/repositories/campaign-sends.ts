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
