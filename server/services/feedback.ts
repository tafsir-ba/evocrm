import "server-only";

import { randomUUID } from "node:crypto";

import { createAuditLog, type CreateAuditLogInput } from "@/server/audit/create-audit-log";
import { sendFeedbackResolvedEmail } from "@/server/email/resend";
import { AppError } from "@/server/errors";
import { getEnv } from "@/server/env";
import {
  ALLOWED_FEEDBACK_IMAGE_TYPES,
  MAX_FEEDBACK_BODY_CHARS,
  MAX_FEEDBACK_SCREENSHOT_BYTES,
  MAX_FEEDBACK_SCREENSHOTS,
  MAX_FEEDBACK_USER_AGENT_CHARS,
  type FeedbackCategory,
  type FeedbackStatus,
} from "@/server/feedback/constants";
import { normalizeFeedbackPageUrl } from "@/server/feedback/page-url";
import {
  countOpenFeedback,
  createFeedback,
  deleteFeedback,
  findFeedbackById,
  getFeedbackStatusCounts,
  listFeedback,
  updateFeedbackStatus,
  type FeedbackRecord,
  type FeedbackScreenshotRecord,
} from "@/server/repositories/feedback";
import { findProjectById } from "@/server/repositories/projects";
import { findUserById } from "@/server/repositories/users";
import { findWorkspaceById } from "@/server/repositories/workspaces";
import { assertFeedbackRateLimit } from "@/server/security/feedback-rate-limit";
import {
  assertFeedbackStorageKey,
  buildFeedbackStorageKey,
} from "@/server/services/feedback-file-utils";
import { sanitizeFileName } from "@/server/services/document-file-utils";
import {
  deleteObject,
  getObjectBuffer,
  isSpacesConfigured,
  uploadObject,
} from "@/server/storage/spaces";
import type { FeedbackSubmitFields } from "@/server/validation/feedback";
import { requireMembership } from "@/server/permissions/require-membership";
import { resolveWorkspace } from "@/server/workspaces/resolve-workspace";
import { resolveFeedbackImageMimeType } from "@/lib/feedback";

export type FeedbackScreenshotPublic = {
  filename: string;
  sizeBytes: number;
  contentType: string;
};

export type FeedbackListItem = {
  id: string;
  category: FeedbackCategory;
  body: string;
  status: FeedbackStatus;
  userEmail: string;
  userName: string | null;
  workspaceId: string | null;
  workspaceName: string | null;
  projectId: string | null;
  pageUrl: string | null;
  userAgent: string | null;
  screenshotCount: number;
  screenshots: FeedbackScreenshotPublic[];
  createdAt: string;
  resolvedAt: string | null;
  resolvedByEmail: string | null;
  resolutionNotifiedAt: string | null;
  resolutionNotifiedEmail: string | null;
  resolutionNotificationStatus: "sent" | "failed" | null;
  resolutionNotificationError: string | null;
};

export type FeedbackDetail = FeedbackListItem & {
  resolvedBy: string | null;
};

function truncateText(value: string | undefined, maxLength: number): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, maxLength);
}

function toScreenshotPublic(
  screenshots: FeedbackScreenshotRecord[],
): FeedbackScreenshotPublic[] {
  return screenshots.map((screenshot) => ({
    filename: screenshot.filename,
    sizeBytes: screenshot.sizeBytes,
    contentType: screenshot.contentType,
  }));
}

async function enrichFeedbackRows(
  records: FeedbackRecord[],
): Promise<FeedbackListItem[]> {
  const workspaceIds = [
    ...new Set(records.map((record) => record.workspaceId).filter(Boolean)),
  ] as string[];
  const resolverIds = [
    ...new Set(records.map((record) => record.resolvedBy).filter(Boolean)),
  ] as string[];

  const [workspaces, resolvers] = await Promise.all([
    Promise.all(workspaceIds.map((workspaceId) => findWorkspaceById(workspaceId))),
    Promise.all(resolverIds.map((userId) => findUserById(userId))),
  ]);

  const workspaceNameById = new Map<string, string>();
  for (const workspace of workspaces) {
    if (workspace) {
      workspaceNameById.set(workspace.id, workspace.name);
    }
  }

  const resolverEmailById = new Map<string, string>();
  for (const resolver of resolvers) {
    if (resolver) {
      resolverEmailById.set(resolver.id, resolver.email);
    }
  }

  return records.map((record) => ({
    id: record.id,
    category: record.category,
    body: record.body,
    status: record.status,
    userEmail: record.userEmail,
    userName: record.userName,
    workspaceId: record.workspaceId,
    workspaceName: record.workspaceId
      ? (workspaceNameById.get(record.workspaceId) ?? null)
      : null,
    projectId: record.projectId,
    pageUrl: record.pageUrl,
    userAgent: record.userAgent,
    screenshotCount: record.screenshots.length,
    screenshots: toScreenshotPublic(record.screenshots),
    createdAt: record.createdAt.toISOString(),
    resolvedAt: record.resolvedAt?.toISOString() ?? null,
    resolvedByEmail: record.resolvedBy
      ? (resolverEmailById.get(record.resolvedBy) ?? null)
      : null,
    resolutionNotifiedAt: record.resolutionNotifiedAt?.toISOString() ?? null,
    resolutionNotifiedEmail: record.resolutionNotifiedEmail,
    resolutionNotificationStatus: record.resolutionNotificationStatus,
    resolutionNotificationError: record.resolutionNotificationError,
  }));
}

function validateScreenshotFile(file: File): string {
  const resolvedMimeType = resolveFeedbackImageMimeType({
    fileName: file.name,
    mimeType: file.type,
  });

  if (!resolvedMimeType) {
    throw new AppError("VALIDATION_ERROR", "Unsupported screenshot type.", {
      details: { mimeType: file.type, allowed: ALLOWED_FEEDBACK_IMAGE_TYPES },
    });
  }

  if (file.size <= 0) {
    throw new AppError("VALIDATION_ERROR", "Screenshot cannot be empty.");
  }

  if (file.size > MAX_FEEDBACK_SCREENSHOT_BYTES) {
    throw new AppError("VALIDATION_ERROR", "Screenshot exceeds maximum allowed size.", {
      details: { maxBytes: MAX_FEEDBACK_SCREENSHOT_BYTES },
    });
  }

  return resolvedMimeType;
}

async function uploadFeedbackScreenshots(input: {
  feedbackId: string;
  files: File[];
}): Promise<FeedbackScreenshotRecord[]> {
  if (!isSpacesConfigured()) {
    throw new AppError(
      "INTERNAL_ERROR",
      "File storage is not configured. Contact your administrator.",
      { expose: true },
    );
  }

  const uploaded: FeedbackScreenshotRecord[] = [];
  const storageKeys: string[] = [];

  try {
    for (const file of input.files) {
      const resolvedMimeType = validateScreenshotFile(file);
      const storageKey = buildFeedbackStorageKey({
        feedbackId: input.feedbackId,
        fileName: file.name,
      });
      const buffer = Buffer.from(await file.arrayBuffer());

      await uploadObject({
        storageKey,
        body: buffer,
        mimeType: resolvedMimeType,
      });

      storageKeys.push(storageKey);
      uploaded.push({
        storageKey,
        filename: sanitizeFileName(file.name),
        sizeBytes: file.size,
        contentType: resolvedMimeType,
      });
    }

    return uploaded;
  } catch (error) {
    await Promise.allSettled(storageKeys.map((storageKey) => deleteObject(storageKey)));
    throw error;
  }
}

async function deleteFeedbackScreenshots(screenshots: FeedbackScreenshotRecord[]): Promise<void> {
  await Promise.allSettled(
    screenshots.map((screenshot) => deleteObject(screenshot.storageKey)),
  );
}

function getAuditWorkspaceId(record: FeedbackRecord): string | null {
  return record.workspaceId ?? null;
}

async function createFeedbackAuditLog(
  record: FeedbackRecord,
  entry: Omit<CreateAuditLogInput, "workspaceId">,
): Promise<void> {
  const workspaceId = getAuditWorkspaceId(record);
  if (!workspaceId) {
    return;
  }

  await createAuditLog({
    workspaceId,
    ...entry,
  });
}

async function resolveFeedbackProjectId(
  workspaceId: string,
  projectId: string | undefined,
): Promise<string | null> {
  if (!projectId) {
    return null;
  }

  const project = await findProjectById(workspaceId, projectId);
  if (!project || project.archivedAt) {
    return null;
  }

  return project.id;
}

export async function submitFeedbackForUser(input: {
  userId: string;
  userEmail: string;
  userName?: string | null;
  fields: FeedbackSubmitFields;
  screenshots: File[];
}): Promise<{ id: string }> {
  assertFeedbackRateLimit(input.userId);

  const body = (input.fields.body ?? "").trim();

  if (!body && input.screenshots.length === 0) {
    throw new AppError("VALIDATION_ERROR", "Message or at least one screenshot is required.");
  }

  if (body.length > MAX_FEEDBACK_BODY_CHARS) {
    throw new AppError("VALIDATION_ERROR", "Message is too long.", {
      details: { maxChars: MAX_FEEDBACK_BODY_CHARS },
    });
  }

  if (input.screenshots.length > MAX_FEEDBACK_SCREENSHOTS) {
    throw new AppError("VALIDATION_ERROR", "Too many screenshots.", {
      details: { maxScreenshots: MAX_FEEDBACK_SCREENSHOTS },
    });
  }

  const workspace = await resolveWorkspace(input.fields.workspaceSlug);
  await requireMembership(workspace.id, input.userId);
  const projectId = await resolveFeedbackProjectId(workspace.id, input.fields.projectId);

  const draftId = randomUUID();
  let screenshots: FeedbackScreenshotRecord[] = [];

  try {
    if (input.screenshots.length > 0) {
      screenshots = await uploadFeedbackScreenshots({
        feedbackId: draftId,
        files: input.screenshots,
      });
    }

    const record = await createFeedback({
      userId: input.userId,
      userEmail: input.userEmail,
      userName: input.userName ?? null,
      workspaceId: workspace.id,
      category: input.fields.category,
      body,
      projectId,
      pageUrl: normalizeFeedbackPageUrl(
        input.fields.pageUrl,
        getEnv().NEXT_PUBLIC_APP_URL,
      ),
      userAgent: truncateText(input.fields.userAgent, MAX_FEEDBACK_USER_AGENT_CHARS),
      screenshots,
    });

    return { id: record.id };
  } catch (error) {
    if (screenshots.length > 0) {
      await deleteFeedbackScreenshots(screenshots);
    }
    throw error;
  }
}

export async function listFeedbackForAdmin(query: {
  status?: FeedbackStatus;
  category?: FeedbackCategory;
  q?: string;
  limit: number;
  offset: number;
}): Promise<{
  items: FeedbackListItem[];
  total: number;
  summary: Awaited<ReturnType<typeof getFeedbackStatusCounts>>;
}> {
  const [{ items, total }, summary] = await Promise.all([
    listFeedback(query),
    getFeedbackStatusCounts(),
  ]);

  return {
    items: await enrichFeedbackRows(items),
    total,
    summary,
  };
}

export async function getFeedbackDetailForAdmin(
  feedbackId: string,
): Promise<FeedbackDetail | null> {
  const record = await findFeedbackById(feedbackId);

  if (!record) {
    return null;
  }

  const [item] = await enrichFeedbackRows([record]);

  return {
    ...item,
    userAgent: record.userAgent,
    resolvedBy: record.resolvedBy,
  };
}

export async function updateFeedbackStatusForAdmin(input: {
  feedbackId: string;
  status: FeedbackStatus;
  adminUserId: string;
  notifyEmail?: string;
}): Promise<FeedbackDetail | null> {
  const existing = await findFeedbackById(input.feedbackId);

  if (!existing) {
    return null;
  }

  if (existing.status === input.status) {
    return getFeedbackDetailForAdmin(input.feedbackId);
  }

  if (input.status === "resolved") {
    const recipient = input.notifyEmail?.trim() || existing.userEmail?.trim();

    if (!recipient) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Reporter email is required to mark feedback as resolved.",
        { expose: true },
      );
    }

    const reporterName = existing.userName?.trim() || "there";
    const sendResult = await sendFeedbackResolvedEmail({
      to: recipient,
      reporterName,
      feedbackMessage: existing.body || "(no message)",
      pageUrl: existing.pageUrl,
    });

    if (!sendResult.success) {
      await createFeedbackAuditLog(existing, {
        actorId: input.adminUserId,
        action: "feedback.notification.failed",
        entityType: "feedback",
        entityId: existing.id,
        after: {
          to: recipient,
          error: sendResult.error,
        },
      });

      throw new AppError(
        "INTERNAL_ERROR",
        `Could not send resolution notification: ${sendResult.error}`,
        { expose: true },
      );
    }

    const updated = await updateFeedbackStatus({
      feedbackId: input.feedbackId,
      status: input.status,
      resolvedBy: input.adminUserId,
      resolutionNotifiedAt: new Date(),
      resolutionNotifiedEmail: recipient,
      resolutionNotificationStatus: "sent",
      resolutionNotificationError: null,
    });

    if (!updated) {
      return null;
    }

    await createFeedbackAuditLog(updated, {
      actorId: input.adminUserId,
      action: "feedback.resolve",
      entityType: "feedback",
      entityId: updated.id,
      before: {
        status: existing.status,
        category: existing.category,
        reporterEmail: existing.userEmail,
      },
      after: {
        status: updated.status,
        category: updated.category,
        reporterEmail: updated.userEmail,
      },
    });

    await createFeedbackAuditLog(updated, {
      actorId: input.adminUserId,
      action: "feedback.notification.sent",
      entityType: "feedback",
      entityId: updated.id,
      after: {
        to: recipient,
        messageId: sendResult.messageId,
        manualEmail: Boolean(input.notifyEmail?.trim()),
      },
    });

    return getFeedbackDetailForAdmin(updated.id);
  }

  const updated = await updateFeedbackStatus({
    feedbackId: input.feedbackId,
    status: input.status,
    resolvedBy: null,
  });

  if (!updated) {
    return null;
  }

  await createFeedbackAuditLog(updated, {
    actorId: input.adminUserId,
    action: "feedback.reopen",
    entityType: "feedback",
    entityId: updated.id,
    before: {
      status: existing.status,
      category: existing.category,
      reporterEmail: existing.userEmail,
    },
    after: {
      status: updated.status,
      category: updated.category,
      reporterEmail: updated.userEmail,
    },
  });

  return getFeedbackDetailForAdmin(updated.id);
}

export async function deleteFeedbackForAdmin(input: {
  feedbackId: string;
  adminUserId: string;
}): Promise<boolean> {
  const existing = await findFeedbackById(input.feedbackId);

  if (!existing) {
    return false;
  }

  const deleted = await deleteFeedback(input.feedbackId);

  if (!deleted) {
    return false;
  }

  await deleteFeedbackScreenshots(deleted.screenshots);

  await createFeedbackAuditLog(deleted, {
    actorId: input.adminUserId,
    action: "feedback.delete",
    entityType: "feedback",
    entityId: deleted.id,
    before: {
      status: deleted.status,
      category: deleted.category,
      reporterEmail: deleted.userEmail,
      body: deleted.body,
      screenshotCount: deleted.screenshots.length,
    },
  });

  return true;
}

export async function getFeedbackScreenshotForAdmin(input: {
  feedbackId: string;
  index: number;
}): Promise<{
  body: Buffer;
  contentType: string;
  filename: string;
} | null> {
  const record = await findFeedbackById(input.feedbackId);

  if (!record) {
    return null;
  }

  const screenshot = record.screenshots[input.index];

  if (!screenshot) {
    return null;
  }

  assertFeedbackStorageKey(screenshot.storageKey);

  const object = await getObjectBuffer(screenshot.storageKey);

  return {
    body: object.body,
    contentType: object.contentType ?? screenshot.contentType,
    filename: screenshot.filename,
  };
}

export async function getOpenFeedbackCountForAdmin(): Promise<number> {
  return countOpenFeedback();
}
