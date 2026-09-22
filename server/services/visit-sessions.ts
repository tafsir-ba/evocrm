import "server-only";

import { randomUUID } from "node:crypto";

import { createAuditLog } from "@/server/audit/create-audit-log";
import { AppError } from "@/server/errors";
import { hasPermission } from "@/server/permissions/permissions";
import { resolveWorkspaceAccess } from "@/server/permissions/resolve-workspace-access";
import { requireProjectAccess } from "@/server/permissions/require-project-access";
import { findDictionaryItemByTypeAndKey } from "@/server/repositories/dictionary-items";
import { archiveDocument, findDocumentById, updateDocumentLinkedEntity } from "@/server/repositories/documents";
import { findLeadById, updateLead } from "@/server/repositories/leads";
import { findProjectById } from "@/server/repositories/projects";
import {
  archiveVisitSession,
  createVisitSession,
  findVisitSessionById,
  findVisitSessions,
  updateVisitSession,
  type VisitAiDraftRecord,
  type VisitMessageRecord,
  type VisitSessionRecord,
} from "@/server/repositories/visit-sessions";
import {
  deriveVisitSessionTitle,
  formatVisitDraftBody,
  formatVisitSessionFallbackTitle,
  isVisitAudioMimeType,
  isVisitVideoMimeType,
} from "@/lib/visit-notes";
import {
  applyUserProjectScope,
  assertRecordProjectAccess,
} from "@/server/services/apply-project-scope";
import {
  createActivityForWorkspace,
  updateActivityForWorkspace,
} from "@/server/services/activities";
import {
  summarizeVisitSessionWithOpenAi,
  transcribeAudioWithOpenAi,
} from "@/server/services/visit-notes-ai";
import { findPropertyById } from "@/server/repositories/properties";
import { getObjectBuffer } from "@/server/storage/spaces";
import type {
  AppendVisitMessageInput,
  CreateVisitSessionInput,
  PublishVisitSessionInput,
  SummarizeVisitSessionInput,
  TranscribeVisitMessageInput,
  UpdateVisitSessionInput,
  VisitSessionListQuery,
} from "@/server/validation/visit-sessions";

export type VisitSessionDetail = VisitSessionRecord & {
  lead: { id: string; fullName: string; email: string | null } | null;
  project: { id: string; name: string } | null;
  property: {
    id: string;
    title: string;
    reference: string | null;
  } | null;
  draftBody: string | null;
};

async function requireActiveSession(
  workspaceId: string,
  sessionId: string,
  actorId: string,
  permission: "activity:read" | "activity:create" | "activity:update" | "activity:archive",
): Promise<VisitSessionRecord> {
  const session = await findVisitSessionById(workspaceId, sessionId);
  if (!session || (session.archivedAt && permission !== "activity:read")) {
    throw new AppError("NOT_FOUND", "Visit session not found.");
  }
  if (session.archivedAt && permission !== "activity:read") {
    throw new AppError("NOT_FOUND", "Visit session not found.");
  }
  await assertRecordProjectAccess(workspaceId, actorId, session.projectId, permission);
  return session;
}

async function enrichSession(session: VisitSessionRecord): Promise<VisitSessionDetail> {
  const [lead, project, property] = await Promise.all([
    findLeadById(session.workspaceId, session.leadId),
    findProjectById(session.workspaceId, session.projectId),
    session.propertyId
      ? findPropertyById(session.workspaceId, session.propertyId)
      : Promise.resolve(null),
  ]);

  return {
    ...session,
    lead: lead
      ? { id: lead.id, fullName: lead.fullName, email: lead.email }
      : null,
    project: project ? { id: project.id, name: project.name } : null,
    property:
      property && !property.archivedAt
        ? {
            id: property.id,
            title: property.title,
            reference: property.reference ?? null,
          }
        : null,
    draftBody: session.aiDraft ? formatVisitDraftBody(session.aiDraft) : null,
  };
}

export async function listVisitSessionsForWorkspace(
  workspaceId: string,
  query: VisitSessionListQuery,
  userId: string,
): Promise<{ sessions: VisitSessionDetail[]; total: number }> {
  const scoped = await applyUserProjectScope<{
    projectId?: string;
    projectIds?: string[];
  }>(workspaceId, userId, {
    projectId: query.projectId,
  });

  if (query.leadId) {
    const lead = await findLeadById(workspaceId, query.leadId);
    if (!lead || lead.archivedAt) {
      throw new AppError("NOT_FOUND", "Lead not found.");
    }
    await assertRecordProjectAccess(workspaceId, userId, lead.projectId, "lead:read");
  }

  const { sessions, total } = await findVisitSessions(workspaceId, {
    leadId: query.leadId,
    projectId: scoped.projectId,
    projectIds: scoped.projectIds,
    includeArchived: query.includeArchived,
    page: query.page,
    pageSize: query.pageSize,
  });

  const enriched = await Promise.all(sessions.map(enrichSession));
  return { sessions: enriched, total };
}

export async function createVisitSessionForWorkspace(
  workspaceId: string,
  actorId: string,
  input: CreateVisitSessionInput,
): Promise<VisitSessionDetail> {
  const lead = await findLeadById(workspaceId, input.leadId);
  if (!lead || lead.archivedAt) {
    throw new AppError("NOT_FOUND", "Lead not found.");
  }
  if (!lead.projectId) {
    throw new AppError("VALIDATION_ERROR", "Lead must belong to a project.");
  }

  await requireProjectAccess(workspaceId, actorId, lead.projectId, "activity:create");

  const session = await createVisitSession({
    workspaceId,
    leadId: lead.id,
    projectId: lead.projectId,
    createdBy: actorId,
    language: input.language ?? null,
  });

  await createAuditLog({
    workspaceId,
    actorId,
    action: "visit_session.created",
    entityType: "visit_session",
    entityId: session.id,
    after: { leadId: session.leadId, projectId: session.projectId },
  });

  return enrichSession(session);
}

export async function getVisitSessionForWorkspace(
  workspaceId: string,
  sessionId: string,
  actorId: string,
): Promise<VisitSessionDetail> {
  const session = await requireActiveSession(
    workspaceId,
    sessionId,
    actorId,
    "activity:read",
  );
  return enrichSession(session);
}

export async function updateVisitSessionForWorkspace(
  workspaceId: string,
  sessionId: string,
  actorId: string,
  input: UpdateVisitSessionInput,
): Promise<VisitSessionDetail> {
  const session = await requireActiveSession(
    workspaceId,
    sessionId,
    actorId,
    "activity:update",
  );

  let aiDraft = session.aiDraft;
  if (input.editedDraftBody !== undefined && aiDraft) {
    aiDraft = {
      ...aiDraft,
      editedBody: input.editedDraftBody,
    };
  }

  let propertyId: string | null | undefined = undefined;
  if (input.propertyId !== undefined) {
    if (input.propertyId === null) {
      propertyId = null;
    } else {
      const property = await findPropertyById(workspaceId, input.propertyId);
      if (!property || property.archivedAt) {
        throw new AppError("NOT_FOUND", "Property not found.");
      }
      if (property.projectId !== session.projectId) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Property must belong to the same project as this visit.",
        );
      }
      await assertRecordProjectAccess(
        workspaceId,
        actorId,
        property.projectId,
        "property:read",
      );
      propertyId = property.id;
    }
  }

  const updated = await updateVisitSession(workspaceId, sessionId, {
    language: input.language === undefined ? undefined : input.language,
    title: input.title === undefined ? undefined : input.title,
    propertyId,
    aiDraft,
    status:
      aiDraft && session.status === "open"
        ? "draft"
        : session.status === "published"
          ? "amended"
          : undefined,
  });

  if (!updated) {
    throw new AppError("NOT_FOUND", "Visit session not found.");
  }

  return enrichSession(updated);
}

export async function appendVisitMessageForWorkspace(
  workspaceId: string,
  sessionId: string,
  actorId: string,
  input: AppendVisitMessageInput,
): Promise<VisitSessionDetail> {
  const session = await requireActiveSession(
    workspaceId,
    sessionId,
    actorId,
    "activity:update",
  );

  if (session.status === "archived") {
    throw new AppError("VALIDATION_ERROR", "Archived sessions cannot be edited.");
  }

  let documentId: string | null = input.documentId ?? null;
  if (documentId) {
    const document = await findDocumentById(workspaceId, documentId);
    if (
      !document ||
      document.archivedAt ||
      document.status !== "active" ||
      document.linkedEntityType !== "visit_session" ||
      document.linkedEntityId !== sessionId
    ) {
      throw new AppError("VALIDATION_ERROR", "Media document is not linked to this session.");
    }
  }

  const message: VisitMessageRecord = {
    id: randomUUID(),
    kind: input.kind,
    text: input.text ?? null,
    documentId,
    language: input.language ?? session.language,
    status: "ready",
    error: null,
    createdBy: actorId,
    createdAt: new Date(),
  };

  const documentIds =
    documentId && !session.documentIds.includes(documentId)
      ? [...session.documentIds, documentId]
      : session.documentIds;

  let title: string | undefined;
  if (!session.title?.trim()) {
    if (input.kind === "text" && input.text?.trim()) {
      title = deriveVisitSessionTitle(input.text);
    } else if (input.kind === "audio") {
      title = "Voice note";
    } else if (input.kind === "photo") {
      title = "Photo visit";
    } else if (input.kind === "video") {
      title = "Video visit";
    }
  }

  const updated = await updateVisitSession(workspaceId, sessionId, {
    messages: [...session.messages, message],
    documentIds,
    title,
    status:
      session.status === "published"
        ? "amended"
        : session.status === "open"
          ? "open"
          : session.status,
  });

  if (!updated) {
    throw new AppError("NOT_FOUND", "Visit session not found.");
  }

  return enrichSession(updated);
}

export async function summarizeVisitSessionForWorkspace(
  workspaceId: string,
  sessionId: string,
  actorId: string,
  input: SummarizeVisitSessionInput,
): Promise<VisitSessionDetail> {
  const session = await requireActiveSession(
    workspaceId,
    sessionId,
    actorId,
    "activity:update",
  );

  const [lead, project, property] = await Promise.all([
    findLeadById(workspaceId, session.leadId),
    findProjectById(workspaceId, session.projectId),
    session.propertyId
      ? findPropertyById(workspaceId, session.propertyId)
      : Promise.resolve(null),
  ]);

  const language = input.language ?? session.language ?? null;
  const propertyLabel =
    property && !property.archivedAt
      ? [property.reference, property.title].filter(Boolean).join(" · ") ||
        property.title
      : null;

  const summary = await summarizeVisitSessionWithOpenAi({
    messages: session.messages,
    language,
    crmLanguage: null,
    leadName: lead?.fullName ?? null,
    projectName: project?.name ?? null,
    propertyLabel,
  });

  const sourceMessageIds = session.messages
    .filter((message) => message.status === "ready")
    .map((message) => message.id);

  const nextVersion = (session.aiDraft?.version ?? 0) + 1;
  const draft: VisitAiDraftRecord = {
    version: nextVersion,
    summary: summary.summary,
    customerRequirements: summary.customerRequirements,
    propertyDiscussed: summary.propertyDiscussed,
    questionsObjections: summary.questionsObjections,
    actions: summary.actions,
    nextSteps: summary.nextSteps.map((step) => ({
      text: step.text,
      ownerName: step.ownerName,
      dueDate: step.dueDate ? new Date(step.dueDate) : null,
      needsConfirmation: step.needsConfirmation,
    })),
    needsConfirmation: summary.needsConfirmation,
    language: summary.language,
    sourceMessageIds,
    editedBody: null,
    createdAt: new Date(),
  };

  const history = session.aiDraft
    ? [...session.draftHistory, session.aiDraft]
    : session.draftHistory;

  const updated = await updateVisitSession(workspaceId, sessionId, {
    aiDraft: draft,
    draftHistory: history,
    language: summary.language,
    status: session.status === "published" ? "amended" : "draft",
  });

  if (!updated) {
    throw new AppError("NOT_FOUND", "Visit session not found.");
  }

  await createAuditLog({
    workspaceId,
    actorId,
    action: "visit_session.summarized",
    entityType: "visit_session",
    entityId: sessionId,
    after: { version: draft.version },
  });

  return enrichSession(updated);
}

export async function publishVisitSessionForWorkspace(
  workspaceId: string,
  sessionId: string,
  actorId: string,
  input: PublishVisitSessionInput,
): Promise<VisitSessionDetail> {
  const session = await requireActiveSession(
    workspaceId,
    sessionId,
    actorId,
    "activity:update",
  );

  let draft = session.aiDraft;
  if (!draft) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Summarize this conversation before saving to lead notes.",
    );
  }

  if (input.editedDraftBody !== undefined) {
    draft = { ...draft, editedBody: input.editedDraftBody };
  }

  if (input.mirrorToLeadNotes) {
    const access = await resolveWorkspaceAccess(workspaceId, actorId);
    if (!hasPermission(access.permissions, "lead:update")) {
      throw new AppError(
        "PERMISSION_DENIED",
        "lead:update is required to mirror the summary onto Lead.notes.",
      );
    }
  }

  const body = formatVisitDraftBody(draft);
  const visitType = await findDictionaryItemByTypeAndKey(
    workspaceId,
    "activity_type",
    "visit",
  );
  const noteType = await findDictionaryItemByTypeAndKey(
    workspaceId,
    "activity_type",
    "note",
  );
  const completedStatus = await findDictionaryItemByTypeAndKey(
    workspaceId,
    "activity_status",
    "completed",
  );

  if (!visitType || !completedStatus) {
    throw new AppError(
      "INTERNAL_ERROR",
      "Visit activity dictionaries are not configured for this workspace.",
    );
  }

  const title =
    session.title?.trim() ||
    formatVisitSessionFallbackTitle(session.createdAt);
  let activityId = session.activityId;

  if (activityId) {
    await updateActivityForWorkspace(workspaceId, activityId, actorId, {
      title,
      description: body,
      outcome: draft.nextSteps.map((step) => step.text).join("\n") || null,
      propertyId: session.propertyId ?? null,
    });
  } else {
    const activity = await createActivityForWorkspace(workspaceId, actorId, {
      typeId: visitType.id,
      statusId: completedStatus.id,
      leadId: session.leadId,
      projectId: session.projectId,
      propertyId: session.propertyId ?? undefined,
      title,
      description: body,
      outcome: draft.nextSteps.map((step) => step.text).join("\n") || undefined,
    });
    activityId = activity.id;
  }

  // Register on the lead Notes tab (Internal notes) — same Activity type the CRM notes UI lists.
  if (input.registerLeadNoteActivity !== false) {
    if (!noteType) {
      throw new AppError(
        "INTERNAL_ERROR",
        "Note activity dictionary is not configured for this workspace.",
      );
    }
    const stamp = new Date().toISOString().slice(0, 10);
    const noteTitle =
      title.length > 80 ? `${title.slice(0, 77)}…` : title || `Note ${stamp}`;

    const mediaDocs = (
      await Promise.all(
        session.documentIds.map((documentId) => findDocumentById(workspaceId, documentId)),
      )
    ).filter((doc): doc is NonNullable<typeof doc> => Boolean(doc && !doc.archivedAt));

    const attachmentLines = mediaDocs.map(
      (doc) => `- ${doc.fileName} (${doc.mimeType})`,
    );
    const noteDescription =
      attachmentLines.length > 0
        ? `${body}\n\n— Attachments (also in lead Files) —\n${attachmentLines.join("\n")}`
        : body;

    await createActivityForWorkspace(workspaceId, actorId, {
      typeId: noteType.id,
      statusId: completedStatus.id,
      leadId: session.leadId,
      projectId: session.projectId,
      propertyId: session.propertyId ?? undefined,
      title: noteTitle,
      description: noteDescription.slice(0, 5000),
    });

    // Surface original session media on the lead Files profile (keep VisitSession documentIds).
    for (const doc of mediaDocs) {
      if (doc.linkedEntityType === "lead" && doc.linkedEntityId === session.leadId) {
        continue;
      }
      await updateDocumentLinkedEntity(workspaceId, doc.id, {
        linkedEntityType: "lead",
        linkedEntityId: session.leadId,
      });
    }
  }

  if (input.createTasksFromNextSteps) {
    const taskType = await findDictionaryItemByTypeAndKey(
      workspaceId,
      "activity_type",
      "task",
    );
    const pendingStatus = await findDictionaryItemByTypeAndKey(
      workspaceId,
      "activity_status",
      "pending",
    );

    if (taskType && pendingStatus) {
      for (const step of draft.nextSteps) {
        if (!step.ownerName && !step.dueDate) continue;
        await createActivityForWorkspace(workspaceId, actorId, {
          typeId: taskType.id,
          statusId: pendingStatus.id,
          leadId: session.leadId,
          projectId: session.projectId,
          title: step.text.slice(0, 120),
          description: step.ownerName
            ? `Owner noted in conversation: ${step.ownerName}`
            : undefined,
          dueDate: step.dueDate ?? undefined,
        });
      }
    }
  }

  if (input.mirrorToLeadNotes) {
    const lead = await findLeadById(workspaceId, session.leadId);
    if (lead) {
      const stamp = new Date().toISOString().slice(0, 10);
      const mirror = `[Note ${stamp}]\n${body}`;
      const notes = lead.notes?.trim()
        ? `${lead.notes.trim()}\n\n${mirror}`
        : mirror;
      await updateLead(workspaceId, lead.id, { notes: notes.slice(0, 5000) });
    }
  }

  const updated = await updateVisitSession(workspaceId, sessionId, {
    activityId,
    aiDraft: draft,
    publishedAt: new Date(),
    status: session.activityId ? "amended" : "published",
  });

  if (!updated) {
    throw new AppError("NOT_FOUND", "Visit session not found.");
  }

  await createAuditLog({
    workspaceId,
    actorId,
    action: "visit_session.published",
    entityType: "visit_session",
    entityId: sessionId,
    after: { activityId },
  });

  return enrichSession(updated);
}

export async function archiveVisitSessionForWorkspace(
  workspaceId: string,
  sessionId: string,
  actorId: string,
): Promise<VisitSessionDetail> {
  const session = await requireActiveSession(
    workspaceId,
    sessionId,
    actorId,
    "activity:archive",
  );

  // Cascade while session is still active so linked-entity validation remains valid
  // for any follow-on document pipelines; Visit Notes retention: media follows Document archive.
  for (const documentId of session.documentIds) {
    await archiveDocument(workspaceId, documentId);
  }

  const updated = await archiveVisitSession(workspaceId, sessionId);
  if (!updated) {
    throw new AppError("NOT_FOUND", "Visit session not found.");
  }

  await createAuditLog({
    workspaceId,
    actorId,
    action: "visit_session.archived",
    entityType: "visit_session",
    entityId: sessionId,
    after: { archivedDocumentIds: session.documentIds },
  });

  return enrichSession(updated);
}

export async function transcribeVisitMessageForWorkspace(
  workspaceId: string,
  sessionId: string,
  actorId: string,
  input: TranscribeVisitMessageInput,
): Promise<VisitSessionDetail> {
  const session = await requireActiveSession(
    workspaceId,
    sessionId,
    actorId,
    "activity:update",
  );

  const messageIndex = session.messages.findIndex(
    (message) => message.id === input.messageId,
  );
  if (messageIndex < 0) {
    throw new AppError("NOT_FOUND", "Message not found in this session.");
  }

  const message = session.messages[messageIndex]!;
  if (message.kind !== "audio" || !message.documentId) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Only audio messages can be transcribed. Video remains attached-only.",
    );
  }

  const document = await findDocumentById(workspaceId, message.documentId);
  if (!document || document.status !== "active") {
    throw new AppError("NOT_FOUND", "Audio document not found.");
  }
  if (!isVisitAudioMimeType(document.mimeType)) {
    throw new AppError("VALIDATION_ERROR", "Document is not an accepted audio type.");
  }
  if (isVisitVideoMimeType(document.mimeType)) {
    throw new AppError("VALIDATION_ERROR", "Video is attached-only and is not transcribed.");
  }

  const messages = [...session.messages];
  messages[messageIndex] = {
    ...message,
    status: "transcribing",
    error: null,
  };
  await updateVisitSession(workspaceId, sessionId, { messages });

  try {
    const object = await getObjectBuffer(document.storageKey);
    const result = await transcribeAudioWithOpenAi({
      body: object.body,
      mimeType: document.mimeType,
      fileName: document.fileName,
      language: input.language ?? session.language,
    });

    const transcriptText = result.text;

    messages[messageIndex] = {
      ...message,
      status: "ready",
      text: transcriptText,
      language: result.language,
      error: null,
    };

    // Single chat event: keep transcript on the audio message only.
    // Do not append a separate kind:"transcript" message.
    const withoutLegacyTranscriptDupes = messages.filter(
      (item, index) =>
        index === messageIndex ||
        !(
          item.kind === "transcript" &&
          item.documentId === message.documentId
        ),
    );

    const updated = await updateVisitSession(workspaceId, sessionId, {
      messages: withoutLegacyTranscriptDupes,
      language: result.language ?? session.language,
      status: session.status === "published" ? "amended" : session.status,
      title:
        session.title?.trim()
          ? undefined
          : deriveVisitSessionTitle(transcriptText) || "Voice note",
    });

    if (!updated) {
      throw new AppError("NOT_FOUND", "Visit session not found.");
    }

    return enrichSession(updated);
  } catch (error) {
    messages[messageIndex] = {
      ...message,
      status: "failed",
      error:
        error instanceof AppError
          ? error.message
          : "Transcription failed. Retry when ready — source audio is preserved.",
    };
    await updateVisitSession(workspaceId, sessionId, { messages });
    throw error;
  }
}
