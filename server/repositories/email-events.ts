import "server-only";

import { connectDb } from "@/server/db/mongoose";
import { EmailEventModel, type EmailEventDocument } from "@/models/email-event";
import { withWorkspaceScope } from "@/server/workspaces/with-workspace-scope";

export type EmailEventRecord = {
  id: string;
  workspaceId: string;
  campaignId: string | null;
  campaignStepId: string | null;
  contactId: string | null;
  emailSendId: string | null;
  provider: "resend";
  providerEventId: string | null;
  providerEmailId: string | null;
  eventType:
    | "delivered"
    | "bounced"
    | "complained"
    | "opened"
    | "clicked"
    | "delivery_delayed"
    | "failed"
    | "sent";
  eventTimestamp: Date;
  rawPayload: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
};

function toRecord(document: EmailEventDocument): EmailEventRecord {
  return {
    id: document._id.toString(),
    workspaceId: document.workspaceId.toString(),
    campaignId: document.campaignId?.toString() ?? null,
    campaignStepId: document.campaignStepId?.toString() ?? null,
    contactId: document.contactId?.toString() ?? null,
    emailSendId: document.emailSendId?.toString() ?? null,
    provider: "resend",
    providerEventId: document.providerEventId ?? null,
    providerEmailId: document.providerEmailId ?? null,
    eventType: document.eventType as EmailEventRecord["eventType"],
    eventTimestamp: document.eventTimestamp,
    rawPayload: (document.rawPayload as Record<string, unknown> | null) ?? null,
    metadata: (document.metadata as Record<string, unknown> | null) ?? null,
    createdAt: document.createdAt,
  };
}

export async function createEmailEvent(
  workspaceId: string,
  input: Omit<EmailEventRecord, "id" | "workspaceId" | "provider" | "createdAt">,
): Promise<EmailEventRecord> {
  await connectDb();

  const document = await EmailEventModel.create({
    workspaceId,
    campaignId: input.campaignId,
    campaignStepId: input.campaignStepId,
    contactId: input.contactId,
    emailSendId: input.emailSendId,
    provider: "resend",
    providerEventId: input.providerEventId,
    providerEmailId: input.providerEmailId,
    eventType: input.eventType,
    eventTimestamp: input.eventTimestamp,
    rawPayload: input.rawPayload,
    metadata: input.metadata,
  });

  return toRecord(document.toObject() as EmailEventDocument);
}

export async function findEmailEventsForCampaign(
  workspaceId: string,
  campaignId: string,
  limit = 50,
): Promise<EmailEventRecord[]> {
  await connectDb();

  const documents = await EmailEventModel.find(
    withWorkspaceScope(workspaceId, { campaignId }),
  )
    .sort({ eventTimestamp: -1 })
    .limit(limit)
    .lean();

  return documents.map((doc) => toRecord(doc as EmailEventDocument));
}
