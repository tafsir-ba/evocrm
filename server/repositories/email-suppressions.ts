import "server-only";

import { connectDb } from "@/server/db/mongoose";
import { EmailSuppressionModel, type EmailSuppressionDocument } from "@/models/email-suppression";
import { withWorkspaceScope } from "@/server/workspaces/with-workspace-scope";

export type EmailSuppressionRecord = {
  id: string;
  workspaceId: string;
  contactId: string | null;
  email: string;
  reason: "unsubscribed" | "hard_bounce" | "complaint" | "manual";
  source: "campaign_unsubscribe" | "webhook" | "manual" | "import";
  notes: string | null;
  createdAt: Date;
};

function toRecord(document: EmailSuppressionDocument): EmailSuppressionRecord {
  return {
    id: document._id.toString(),
    workspaceId: document.workspaceId.toString(),
    contactId: document.contactId?.toString() ?? null,
    email: document.email,
    reason: document.reason as EmailSuppressionRecord["reason"],
    source: document.source as EmailSuppressionRecord["source"],
    notes: document.notes ?? null,
    createdAt: document.createdAt,
  };
}

export async function findSuppressionByEmail(
  workspaceId: string,
  email: string,
): Promise<EmailSuppressionRecord | null> {
  await connectDb();

  const document = await EmailSuppressionModel.findOne(
    withWorkspaceScope(workspaceId, { email: email.toLowerCase().trim() }),
  ).lean();

  return document ? toRecord(document as EmailSuppressionDocument) : null;
}

export async function upsertEmailSuppression(
  workspaceId: string,
  input: {
    email: string;
    contactId?: string | null;
    reason: EmailSuppressionRecord["reason"];
    source: EmailSuppressionRecord["source"];
    notes?: string | null;
  },
): Promise<EmailSuppressionRecord> {
  await connectDb();

  const document = await EmailSuppressionModel.findOneAndUpdate(
    withWorkspaceScope(workspaceId, { email: input.email.toLowerCase().trim() }),
    {
      $set: {
        contactId: input.contactId ?? null,
        reason: input.reason,
        source: input.source,
        notes: input.notes ?? null,
      },
      $setOnInsert: {
        workspaceId,
        email: input.email.toLowerCase().trim(),
      },
    },
    { upsert: true, new: true },
  ).lean();

  return toRecord(document as EmailSuppressionDocument);
}
