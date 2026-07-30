import "server-only";

import { connectDb } from "@/server/db/mongoose";
import { EmailEventModel, type EmailEventDocument } from "@/models/email-event";
import { withWorkspaceScope } from "@/server/workspaces/with-workspace-scope";
import mongoose from "mongoose";

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

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: number }).code === 11000
  );
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

/**
 * Idempotent create keyed by providerEventId (Svix id).
 * Returns created=false when the event was already ingested.
 */
export async function createEmailEventIdempotent(
  workspaceId: string,
  input: Omit<EmailEventRecord, "id" | "workspaceId" | "provider" | "createdAt">,
): Promise<{ event: EmailEventRecord; created: boolean }> {
  await connectDb();

  if (input.providerEventId) {
    const existing = await EmailEventModel.findOne({
      providerEventId: input.providerEventId,
    }).lean();

    if (existing) {
      return {
        event: toRecord(existing as EmailEventDocument),
        created: false,
      };
    }
  }

  try {
    const event = await createEmailEvent(workspaceId, input);
    return { event, created: true };
  } catch (error) {
    if (isDuplicateKeyError(error) && input.providerEventId) {
      const existing = await EmailEventModel.findOne({
        providerEventId: input.providerEventId,
      }).lean();

      if (existing) {
        return {
          event: toRecord(existing as EmailEventDocument),
          created: false,
        };
      }
    }

    throw error;
  }
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

export async function countEmailEventsByTypeInRange(
  workspaceId: string,
  campaignId: string,
  from: Date,
  to: Date,
): Promise<Record<string, number>> {
  await connectDb();

  const rows = await EmailEventModel.aggregate<{ _id: string; count: number }>([
    {
      $match: {
        workspaceId: new mongoose.Types.ObjectId(workspaceId),
        campaignId: new mongoose.Types.ObjectId(campaignId),
        eventTimestamp: { $gte: from, $lte: to },
      },
    },
    { $group: { _id: "$eventType", count: { $sum: 1 } } },
  ]);

  return Object.fromEntries(rows.map((row) => [row._id, row.count]));
}
