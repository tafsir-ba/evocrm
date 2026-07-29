import "server-only";

import { connectDb } from "@/server/db/mongoose";
import {
  NotificationModel,
  type NotificationDocument,
  type NotificationType,
} from "@/models/notification";

export type NotificationRecord = {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  href: string | null;
  workspaceId: string | null;
  entityType: string | null;
  entityId: string | null;
  readAt: Date | null;
  meta: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};

function toNotificationRecord(document: NotificationDocument): NotificationRecord {
  return {
    id: document._id.toString(),
    userId: document.userId.toString(),
    type: document.type as NotificationType,
    title: document.title,
    body: document.body ?? "",
    href: document.href ?? null,
    workspaceId: document.workspaceId?.toString() ?? null,
    entityType: document.entityType ?? null,
    entityId: document.entityId ?? null,
    readAt: document.readAt ?? null,
    meta: (document.meta as Record<string, unknown> | null) ?? null,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export async function createNotification(input: {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  href?: string | null;
  workspaceId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  meta?: Record<string, unknown> | null;
}): Promise<NotificationRecord> {
  await connectDb();

  const document = await NotificationModel.create({
    userId: input.userId,
    type: input.type,
    title: input.title,
    body: input.body ?? "",
    href: input.href ?? null,
    workspaceId: input.workspaceId ?? null,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    meta: input.meta ?? null,
    readAt: null,
  });

  return toNotificationRecord(document);
}

export async function listNotificationsForUser(input: {
  userId: string;
  limit?: number;
}): Promise<NotificationRecord[]> {
  await connectDb();

  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
  const documents = await NotificationModel.find({ userId: input.userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean<NotificationDocument[]>();

  return documents.map(toNotificationRecord);
}

export async function countUnreadNotificationsForUser(userId: string): Promise<number> {
  await connectDb();

  return NotificationModel.countDocuments({
    userId,
    readAt: null,
  });
}

export async function findNotificationForUser(input: {
  notificationId: string;
  userId: string;
}): Promise<NotificationRecord | null> {
  await connectDb();

  const document = await NotificationModel.findOne({
    _id: input.notificationId,
    userId: input.userId,
  }).lean<NotificationDocument | null>();

  if (!document) {
    return null;
  }

  return toNotificationRecord(document);
}

export async function markNotificationRead(input: {
  notificationId: string;
  userId: string;
}): Promise<NotificationRecord | null> {
  await connectDb();

  const document = await NotificationModel.findOneAndUpdate(
    {
      _id: input.notificationId,
      userId: input.userId,
      readAt: null,
    },
    { $set: { readAt: new Date() } },
    { new: true },
  ).lean<NotificationDocument | null>();

  if (!document) {
    return findNotificationForUser(input);
  }

  return toNotificationRecord(document);
}

export async function markAllNotificationsReadForUser(userId: string): Promise<number> {
  await connectDb();

  const result = await NotificationModel.updateMany(
    { userId, readAt: null },
    { $set: { readAt: new Date() } },
  );

  return result.modifiedCount;
}
