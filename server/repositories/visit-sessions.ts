import "server-only";

import { connectDb } from "@/server/db/mongoose";
import {
  VisitSessionModel,
  type VisitSessionDocument,
  type VisitMessageKind,
  type VisitMessageStatus,
  type VisitSessionStatus,
} from "@/models/visit-session";
import { withWorkspaceScope } from "@/server/workspaces/with-workspace-scope";
import { toObjectIdString } from "@/server/utils/mongo-id";

export type VisitNextStepRecord = {
  text: string;
  ownerName: string | null;
  dueDate: Date | null;
  needsConfirmation: boolean;
};

export type VisitAiDraftRecord = {
  version: number;
  summary: string;
  customerRequirements: string;
  propertyDiscussed: string;
  questionsObjections: string;
  actions: string;
  nextSteps: VisitNextStepRecord[];
  needsConfirmation: string[];
  language: string;
  sourceMessageIds: string[];
  editedBody: string | null;
  createdAt: Date;
};

export type VisitMessageRecord = {
  id: string;
  kind: VisitMessageKind;
  text: string | null;
  documentId: string | null;
  language: string | null;
  status: VisitMessageStatus;
  error: string | null;
  createdBy: string;
  createdAt: Date;
};

export type VisitSessionRecord = {
  id: string;
  workspaceId: string;
  leadId: string;
  projectId: string;
  activityId: string | null;
  createdBy: string;
  status: VisitSessionStatus;
  language: string | null;
  messages: VisitMessageRecord[];
  documentIds: string[];
  aiDraft: VisitAiDraftRecord | null;
  draftHistory: VisitAiDraftRecord[];
  publishedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toNextStep(raw: {
  text: string;
  ownerName?: string | null;
  dueDate?: Date | null;
  needsConfirmation?: boolean;
}): VisitNextStepRecord {
  return {
    text: raw.text,
    ownerName: raw.ownerName ?? null,
    dueDate: raw.dueDate ?? null,
    needsConfirmation: Boolean(raw.needsConfirmation),
  };
}

function toAiDraft(raw: {
  version: number;
  summary?: string | null;
  customerRequirements?: string | null;
  propertyDiscussed?: string | null;
  questionsObjections?: string | null;
  actions?: string | null;
  nextSteps?: Array<{
    text: string;
    ownerName?: string | null;
    dueDate?: Date | null;
    needsConfirmation?: boolean;
  }>;
  needsConfirmation?: string[];
  language?: string | null;
  sourceMessageIds?: string[];
  editedBody?: string | null;
  createdAt: Date;
}): VisitAiDraftRecord {
  return {
    version: raw.version,
    summary: raw.summary ?? "",
    customerRequirements: raw.customerRequirements ?? "",
    propertyDiscussed: raw.propertyDiscussed ?? "",
    questionsObjections: raw.questionsObjections ?? "",
    actions: raw.actions ?? "",
    nextSteps: (raw.nextSteps ?? []).map(toNextStep),
    needsConfirmation: raw.needsConfirmation ?? [],
    language: raw.language ?? "en",
    sourceMessageIds: raw.sourceMessageIds ?? [],
    editedBody: raw.editedBody ?? null,
    createdAt: raw.createdAt,
  };
}

function toMessage(raw: {
  id: string;
  kind: VisitMessageKind;
  text?: string | null;
  documentId?: { toString(): string } | null;
  language?: string | null;
  status?: VisitMessageStatus;
  error?: string | null;
  createdBy: { toString(): string };
  createdAt: Date;
}): VisitMessageRecord {
  return {
    id: raw.id,
    kind: raw.kind,
    text: raw.text ?? null,
    documentId: raw.documentId?.toString() ?? null,
    language: raw.language ?? null,
    status: raw.status ?? "ready",
    error: raw.error ?? null,
    createdBy: raw.createdBy.toString(),
    createdAt: raw.createdAt,
  };
}

function toVisitSessionRecord(document: VisitSessionDocument): VisitSessionRecord {
  return {
    id: document._id.toString(),
    workspaceId: document.workspaceId.toString(),
    leadId: document.leadId.toString(),
    projectId: document.projectId.toString(),
    activityId: toObjectIdString(document.activityId),
    createdBy: document.createdBy.toString(),
    status: document.status as VisitSessionStatus,
    language: document.language ?? null,
    messages: (document.messages ?? []).map((message) =>
      toMessage(message as Parameters<typeof toMessage>[0]),
    ),
    documentIds: (document.documentIds ?? []).map((id) => id.toString()),
    aiDraft: document.aiDraft
      ? toAiDraft(document.aiDraft as Parameters<typeof toAiDraft>[0])
      : null,
    draftHistory: (document.draftHistory ?? []).map((draft) =>
      toAiDraft(draft as Parameters<typeof toAiDraft>[0]),
    ),
    publishedAt: document.publishedAt ?? null,
    archivedAt: document.archivedAt ?? null,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export type VisitSessionListFilter = {
  leadId?: string;
  projectId?: string;
  projectIds?: string[];
  includeArchived?: boolean;
  page?: number;
  pageSize?: number;
};

export async function createVisitSession(input: {
  workspaceId: string;
  leadId: string;
  projectId: string;
  createdBy: string;
  language?: string | null;
}): Promise<VisitSessionRecord> {
  await connectDb();

  const created = await VisitSessionModel.create(
    withWorkspaceScope(input.workspaceId, {
      leadId: input.leadId,
      projectId: input.projectId,
      createdBy: input.createdBy,
      language: input.language ?? null,
      status: "open",
      messages: [],
      documentIds: [],
      aiDraft: null,
      draftHistory: [],
    }),
  );

  return toVisitSessionRecord(created);
}

export async function findVisitSessionById(
  workspaceId: string,
  sessionId: string,
): Promise<VisitSessionRecord | null> {
  await connectDb();

  const document = await VisitSessionModel.findOne(
    withWorkspaceScope(workspaceId, { _id: sessionId }),
  ).exec();

  return document ? toVisitSessionRecord(document) : null;
}

export async function findVisitSessions(
  workspaceId: string,
  filter: VisitSessionListFilter = {},
): Promise<{ sessions: VisitSessionRecord[]; total: number }> {
  await connectDb();

  const query: Record<string, unknown> = withWorkspaceScope(workspaceId, {});

  if (!filter.includeArchived) {
    query.archivedAt = null;
  }

  if (filter.leadId) {
    query.leadId = filter.leadId;
  }

  if (filter.projectId) {
    query.projectId = filter.projectId;
  } else if (filter.projectIds) {
    if (filter.projectIds.length === 0) {
      return { sessions: [], total: 0 };
    }
    query.projectId = { $in: filter.projectIds };
  }

  const page = filter.page ?? 1;
  const pageSize = filter.pageSize ?? 25;
  const skip = (page - 1) * pageSize;

  const [documents, total] = await Promise.all([
    VisitSessionModel.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .exec(),
    VisitSessionModel.countDocuments(query).exec(),
  ]);

  return {
    sessions: documents.map(toVisitSessionRecord),
    total,
  };
}

export async function updateVisitSession(
  workspaceId: string,
  sessionId: string,
  update: {
    status?: VisitSessionStatus;
    language?: string | null;
    activityId?: string | null;
    messages?: VisitMessageRecord[];
    documentIds?: string[];
    aiDraft?: VisitAiDraftRecord | null;
    draftHistory?: VisitAiDraftRecord[];
    publishedAt?: Date | null;
    archivedAt?: Date | null;
  },
): Promise<VisitSessionRecord | null> {
  await connectDb();

  const $set: Record<string, unknown> = {};

  if (update.status !== undefined) $set.status = update.status;
  if (update.language !== undefined) $set.language = update.language;
  if (update.activityId !== undefined) $set.activityId = update.activityId;
  if (update.messages !== undefined) $set.messages = update.messages;
  if (update.documentIds !== undefined) $set.documentIds = update.documentIds;
  if (update.aiDraft !== undefined) $set.aiDraft = update.aiDraft;
  if (update.draftHistory !== undefined) $set.draftHistory = update.draftHistory;
  if (update.publishedAt !== undefined) $set.publishedAt = update.publishedAt;
  if (update.archivedAt !== undefined) $set.archivedAt = update.archivedAt;

  const document = await VisitSessionModel.findOneAndUpdate(
    withWorkspaceScope(workspaceId, { _id: sessionId }),
    { $set },
    { new: true },
  ).exec();

  return document ? toVisitSessionRecord(document) : null;
}

export async function archiveVisitSession(
  workspaceId: string,
  sessionId: string,
): Promise<VisitSessionRecord | null> {
  return updateVisitSession(workspaceId, sessionId, {
    status: "archived",
    archivedAt: new Date(),
  });
}
