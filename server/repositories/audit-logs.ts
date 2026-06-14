import "server-only";

import { connectDb } from "@/server/db/mongoose";
import { AuditLogModel, type AuditLogDocument } from "@/models/audit-log";

export type AuditLogRecord = {
  id: string;
  workspaceId: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: Date;
};

function toAuditLogRecord(document: AuditLogDocument): AuditLogRecord {
  return {
    id: document._id.toString(),
    workspaceId: document.workspaceId.toString(),
    actorId: document.actorId.toString(),
    action: document.action,
    entityType: document.entityType,
    entityId: document.entityId,
    before: (document.before as Record<string, unknown> | null) ?? null,
    after: (document.after as Record<string, unknown> | null) ?? null,
    createdAt: document.createdAt,
  };
}

export async function createAuditLogRecord(input: {
  workspaceId: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  createdAt?: Date;
}): Promise<AuditLogRecord> {
  await connectDb();

  const document = await AuditLogModel.create({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    before: input.before ?? null,
    after: input.after ?? null,
    ...(input.createdAt ? { createdAt: input.createdAt } : {}),
  });

  return toAuditLogRecord(document);
}
