import "server-only";

import {
  countUnreadNotificationsForUser,
  createNotification,
  listNotificationsForUser,
  markAllNotificationsReadForUser,
  markNotificationRead,
  type NotificationRecord,
} from "@/server/repositories/notifications";
import type { NotificationType } from "@/models/notification";

export type NotificationListItem = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  href: string | null;
  workspaceId: string | null;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
};

function toNotificationListItem(record: NotificationRecord): NotificationListItem {
  return {
    id: record.id,
    type: record.type,
    title: record.title,
    body: record.body,
    href: record.href,
    workspaceId: record.workspaceId,
    entityType: record.entityType,
    entityId: record.entityId,
    readAt: record.readAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
  };
}

export async function listNotificationsForCurrentUser(input: {
  userId: string;
  limit?: number;
}): Promise<{ items: NotificationListItem[]; unreadCount: number }> {
  const [items, unreadCount] = await Promise.all([
    listNotificationsForUser({
      userId: input.userId,
      limit: input.limit,
    }),
    countUnreadNotificationsForUser(input.userId),
  ]);

  return {
    items: items.map(toNotificationListItem),
    unreadCount,
  };
}

export async function markNotificationReadForCurrentUser(input: {
  userId: string;
  notificationId: string;
}): Promise<NotificationListItem | null> {
  const updated = await markNotificationRead({
    notificationId: input.notificationId,
    userId: input.userId,
  });

  return updated ? toNotificationListItem(updated) : null;
}

export async function markAllNotificationsReadForCurrentUser(
  userId: string,
): Promise<{ updated: number }> {
  const updated = await markAllNotificationsReadForUser(userId);
  return { updated };
}

export async function notifyFeedbackResolved(input: {
  userId: string;
  feedbackId: string;
  category: "bug" | "idea" | "other";
  feedbackMessage: string;
  pageUrl?: string | null;
  workspaceId?: string | null;
}): Promise<NotificationRecord> {
  const isBug = input.category === "bug";
  const truncatedBody =
    input.feedbackMessage.length > 160
      ? `${input.feedbackMessage.slice(0, 157).trimEnd()}…`
      : input.feedbackMessage;

  return createNotification({
    userId: input.userId,
    type: "feedback.resolved",
    title: isBug ? "Your bug has been solved" : "Your feedback has been resolved",
    body: truncatedBody || "Thanks for your report — this item is now marked resolved.",
    href: input.pageUrl ?? null,
    workspaceId: input.workspaceId ?? null,
    entityType: "feedback",
    entityId: input.feedbackId,
    meta: {
      category: input.category,
    },
  });
}
