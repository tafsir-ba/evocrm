import "server-only";

import { connectDb } from "@/server/db/mongoose";
import { FeedbackModel, type FeedbackDocument } from "@/models/feedback";
import type {
  FeedbackCategory,
  FeedbackStatus,
} from "@/server/feedback/constants";

export type FeedbackScreenshotRecord = {
  storageKey: string;
  filename: string;
  sizeBytes: number;
  contentType: string;
};

export type FeedbackRecord = {
  id: string;
  userId: string;
  userEmail: string;
  userName: string | null;
  workspaceId: string | null;
  category: FeedbackCategory;
  body: string;
  projectId: string | null;
  pageUrl: string | null;
  userAgent: string | null;
  screenshots: FeedbackScreenshotRecord[];
  status: FeedbackStatus;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  resolutionNotifiedAt: Date | null;
  resolutionNotifiedEmail: string | null;
  resolutionNotificationStatus: "sent" | "failed" | null;
  resolutionNotificationError: string | null;
};

function toFeedbackRecord(document: FeedbackDocument): FeedbackRecord {
  return {
    id: document._id.toString(),
    userId: document.userId.toString(),
    userEmail: document.userEmail,
    userName: document.userName ?? null,
    workspaceId: document.workspaceId?.toString() ?? null,
    category: document.category,
    body: document.body ?? "",
    projectId: document.projectId?.toString() ?? null,
    pageUrl: document.pageUrl ?? null,
    userAgent: document.userAgent ?? null,
    screenshots: (document.screenshots ?? []).map((screenshot) => ({
      storageKey: screenshot.storageKey,
      filename: screenshot.filename,
      sizeBytes: screenshot.sizeBytes,
      contentType: screenshot.contentType,
    })),
    status: document.status,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    resolvedAt: document.resolvedAt ?? null,
    resolvedBy: document.resolvedBy?.toString() ?? null,
    resolutionNotifiedAt: document.resolutionNotifiedAt ?? null,
    resolutionNotifiedEmail: document.resolutionNotifiedEmail ?? null,
    resolutionNotificationStatus: document.resolutionNotificationStatus ?? null,
    resolutionNotificationError: document.resolutionNotificationError ?? null,
  };
}

export async function createFeedback(input: {
  userId: string;
  userEmail: string;
  userName?: string | null;
  workspaceId?: string | null;
  category: FeedbackCategory;
  body: string;
  projectId?: string | null;
  pageUrl?: string | null;
  userAgent?: string | null;
  screenshots: FeedbackScreenshotRecord[];
}): Promise<FeedbackRecord> {
  await connectDb();

  const document = await FeedbackModel.create({
    userId: input.userId,
    userEmail: input.userEmail,
    userName: input.userName ?? null,
    workspaceId: input.workspaceId ?? null,
    category: input.category,
    body: input.body,
    projectId: input.projectId ?? null,
    pageUrl: input.pageUrl ?? null,
    userAgent: input.userAgent ?? null,
    screenshots: input.screenshots,
    status: "open",
  });

  return toFeedbackRecord(document);
}

export async function findFeedbackById(feedbackId: string): Promise<FeedbackRecord | null> {
  await connectDb();

  const document = await FeedbackModel.findById(feedbackId).lean<FeedbackDocument | null>();

  if (!document) {
    return null;
  }

  return toFeedbackRecord(document);
}

export async function listFeedback(input: {
  status?: FeedbackStatus;
  category?: FeedbackCategory;
  q?: string;
  limit: number;
  offset: number;
}): Promise<{ items: FeedbackRecord[]; total: number }> {
  await connectDb();

  const filter: Record<string, unknown> = {};

  if (input.status) {
    filter.status = input.status;
  }

  if (input.category) {
    filter.category = input.category;
  }

  if (input.q) {
    const regex = new RegExp(input.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ body: regex }, { userEmail: regex }];
  }

  const [documents, total] = await Promise.all([
    FeedbackModel.find(filter)
      .sort({ createdAt: -1 })
      .skip(input.offset)
      .limit(input.limit)
      .lean<FeedbackDocument[]>(),
    FeedbackModel.countDocuments(filter),
  ]);

  return {
    items: documents.map((document) => toFeedbackRecord(document)),
    total,
  };
}

export async function countOpenFeedback(): Promise<number> {
  await connectDb();
  return FeedbackModel.countDocuments({ status: "open" });
}

export async function updateFeedbackStatus(input: {
  feedbackId: string;
  status: FeedbackStatus;
  resolvedBy?: string | null;
  resolutionNotifiedAt?: Date | null;
  resolutionNotifiedEmail?: string | null;
  resolutionNotificationStatus?: "sent" | "failed" | null;
  resolutionNotificationError?: string | null;
}): Promise<FeedbackRecord | null> {
  await connectDb();

  const update: Record<string, unknown> = {
    status: input.status,
  };

  if (input.status === "resolved") {
    update.resolvedAt = new Date();
    update.resolvedBy = input.resolvedBy ?? null;
    if (input.resolutionNotifiedAt !== undefined) {
      update.resolutionNotifiedAt = input.resolutionNotifiedAt;
    }
    if (input.resolutionNotifiedEmail !== undefined) {
      update.resolutionNotifiedEmail = input.resolutionNotifiedEmail;
    }
    if (input.resolutionNotificationStatus !== undefined) {
      update.resolutionNotificationStatus = input.resolutionNotificationStatus;
    }
    if (input.resolutionNotificationError !== undefined) {
      update.resolutionNotificationError = input.resolutionNotificationError;
    }
  } else {
    update.resolvedAt = null;
    update.resolvedBy = null;
    update.resolutionNotifiedAt = null;
    update.resolutionNotifiedEmail = null;
    update.resolutionNotificationStatus = null;
    update.resolutionNotificationError = null;
  }

  const document = await FeedbackModel.findByIdAndUpdate(input.feedbackId, update, {
    new: true,
  }).lean<FeedbackDocument | null>();

  if (!document) {
    return null;
  }

  return toFeedbackRecord(document);
}

export async function deleteFeedback(feedbackId: string): Promise<FeedbackRecord | null> {
  await connectDb();

  const document = await FeedbackModel.findByIdAndDelete(feedbackId).lean<FeedbackDocument | null>();

  if (!document) {
    return null;
  }

  return toFeedbackRecord(document);
}

export async function getFeedbackStatusCounts(): Promise<{
  open: number;
  resolved: number;
  total: number;
  byCategory: Record<FeedbackCategory, number>;
}> {
  await connectDb();

  const [open, resolved, bug, idea, other] = await Promise.all([
    FeedbackModel.countDocuments({ status: "open" }),
    FeedbackModel.countDocuments({ status: "resolved" }),
    FeedbackModel.countDocuments({ category: "bug" }),
    FeedbackModel.countDocuments({ category: "idea" }),
    FeedbackModel.countDocuments({ category: "other" }),
  ]);

  return {
    open,
    resolved,
    total: open + resolved,
    byCategory: {
      bug,
      idea,
      other,
    },
  };
}
