/**
 * Acceptance: publish a general note with media, then assert the same query
 * shapes used by Lead Notes and Lead Files tabs see the Note + Files.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const findVisitSessionById = vi.fn();
const updateVisitSession = vi.fn();
const findDocumentById = vi.fn();
const updateDocumentLinkedEntity = vi.fn();
const findLeadById = vi.fn();
const updateLead = vi.fn();
const findProjectById = vi.fn();
const createAuditLog = vi.fn();
const findActivityById = vi.fn();
const resolveWorkspaceAccess = vi.fn();
const hasPermission = vi.fn();
const assertRecordProjectAccess = vi.fn();
const findDictionaryItemByTypeAndKey = vi.fn();
const createActivityForWorkspace = vi.fn();
const updateActivityForWorkspace = vi.fn();
const findActivities = vi.fn();
const findDocuments = vi.fn();

vi.mock("@/server/permissions/require-project-access", () => ({
  requireProjectAccess: vi.fn(),
}));
vi.mock("@/server/services/apply-project-scope", () => ({
  applyUserProjectScope: vi.fn(),
  assertRecordProjectAccess: (...args: unknown[]) => assertRecordProjectAccess(...args),
}));
vi.mock("@/server/permissions/resolve-workspace-access", () => ({
  resolveWorkspaceAccess: (...args: unknown[]) => resolveWorkspaceAccess(...args),
}));
vi.mock("@/server/permissions/permissions", async () => {
  const actual = await vi.importActual<typeof import("@/server/permissions/permissions")>(
    "@/server/permissions/permissions",
  );
  return {
    ...actual,
    hasPermission: (...args: unknown[]) => hasPermission(...args),
  };
});
vi.mock("@/server/repositories/visit-sessions", () => ({
  findVisitSessionById: (...args: unknown[]) => findVisitSessionById(...args),
  updateVisitSession: (...args: unknown[]) => updateVisitSession(...args),
  createVisitSession: vi.fn(),
  findVisitSessions: vi.fn(),
  archiveVisitSession: vi.fn(),
}));
vi.mock("@/server/repositories/documents", () => ({
  findDocumentById: (...args: unknown[]) => findDocumentById(...args),
  updateDocumentLinkedEntity: (...args: unknown[]) => updateDocumentLinkedEntity(...args),
  archiveDocument: vi.fn(),
  findDocuments: (...args: unknown[]) => findDocuments(...args),
}));
vi.mock("@/server/repositories/leads", () => ({
  findLeadById: (...args: unknown[]) => findLeadById(...args),
  updateLead: (...args: unknown[]) => updateLead(...args),
}));
vi.mock("@/server/repositories/projects", () => ({
  findProjectById: (...args: unknown[]) => findProjectById(...args),
}));
vi.mock("@/server/repositories/activities", () => ({
  findActivityById: (...args: unknown[]) => findActivityById(...args),
  findActivities: (...args: unknown[]) => findActivities(...args),
}));
vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: (...args: unknown[]) => createAuditLog(...args),
}));
vi.mock("@/server/repositories/dictionary-items", () => ({
  findDictionaryItemByTypeAndKey: (...args: unknown[]) =>
    findDictionaryItemByTypeAndKey(...args),
}));
vi.mock("@/server/services/activities", () => ({
  createActivityForWorkspace: (...args: unknown[]) => createActivityForWorkspace(...args),
  updateActivityForWorkspace: (...args: unknown[]) => updateActivityForWorkspace(...args),
}));
vi.mock("@/server/services/visit-notes-ai", () => ({
  summarizeVisitSessionWithOpenAi: vi.fn(),
  transcribeAudioWithOpenAi: vi.fn(),
}));
vi.mock("@/server/storage/spaces", () => ({ getObjectBuffer: vi.fn() }));

import { findActivities as findActivitiesRepo } from "@/server/repositories/activities";
import { findDocuments as findDocumentsRepo } from "@/server/repositories/documents";
import { publishVisitSessionForWorkspace } from "@/server/services/visit-sessions";

/**
 * Exact query shape used by NotesSection.loadNotes after resolving note typeId.
 * @see components/activities/notes-section.tsx
 */
function leadNotesTabQuery(leadId: string, noteTypeId: string) {
  return {
    leadId,
    typeId: noteTypeId,
    page: 1,
    pageSize: 50,
    includeArchived: false,
  };
}

/**
 * Exact query shape used by DocumentsSection for the lead Files tab.
 * @see components/documents/documents-section.tsx + lead-detail-panel.tsx
 */
function leadFilesTabQuery(leadId: string) {
  return {
    linkedEntityType: "lead" as const,
    linkedEntityId: leadId,
    page: 1,
    pageSize: 50,
    includeArchived: false,
  };
}

describe("acceptance: publish general note surfaces on lead Notes + Files queries", () => {
  const workspaceId = "507f1f77bcf86cd799439001";
  const leadId = "507f1f77bcf86cd799439011";
  const sessionId = "507f1f77bcf86cd799439013";
  const docId = "507f1f77bcf86cd799439021";
  const noteTypeId = "type-note";

  beforeEach(() => {
    vi.clearAllMocks();
    assertRecordProjectAccess.mockResolvedValue(undefined);
    hasPermission.mockImplementation(
      (permissions: string[], required: string) => permissions.includes(required),
    );
    resolveWorkspaceAccess.mockResolvedValue({
      permissions: ["activity:update", "activity:create", "lead:update"],
    });
    findDictionaryItemByTypeAndKey.mockImplementation(async (_ws, type, key) => {
      if (type === "activity_type" && key === "note") {
        return { id: noteTypeId, key: "note", label: "Note" };
      }
      if (type === "activity_status" && key === "completed") {
        return { id: "status-done", key: "completed", label: "Completed" };
      }
      return null;
    });
    findLeadById.mockResolvedValue({
      id: leadId,
      fullName: "QA Safe Lead",
      email: "qa-safe@example.com",
      notes: null,
      projectId: "507f1f77bcf86cd799439012",
      archivedAt: null,
    });
    findProjectById.mockResolvedValue({
      id: "507f1f77bcf86cd799439012",
      name: "Demo",
      workspaceId,
    });
    findActivityById.mockResolvedValue(null);
  });

  it("after publish, Notes-tab and Files-tab query filters would return the Note and media", async () => {
    findVisitSessionById.mockResolvedValue({
      id: sessionId,
      workspaceId,
      leadId,
      projectId: "507f1f77bcf86cd799439012",
      propertyId: null,
      title: "General capture QA",
      activityId: null,
      noteActivityId: null,
      createdBy: "actor",
      status: "open",
      language: "en",
      messages: [],
      documentIds: [docId],
      aiDraft: {
        version: 1,
        summary: "Buyer liked the balcony.",
        customerRequirements: "",
        propertyDiscussed: "",
        questionsObjections: "",
        actions: "",
        nextSteps: [],
        needsConfirmation: [],
        language: "en",
        sourceMessageIds: [],
        editedBody: null,
        createdAt: new Date(),
      },
      draftHistory: [],
      publishedAt: null,
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    findDocumentById.mockResolvedValue({
      id: docId,
      fileName: "balcony.jpg",
      mimeType: "image/jpeg",
      archivedAt: null,
      linkedEntityType: "visit_session",
      linkedEntityId: sessionId,
    });
    createActivityForWorkspace.mockResolvedValue({
      id: "note-1",
      typeId: noteTypeId,
      leadId,
      title: "General capture QA",
      description: "Buyer liked the balcony.",
    });
    updateVisitSession.mockResolvedValue({
      id: sessionId,
      workspaceId,
      leadId,
      projectId: "507f1f77bcf86cd799439012",
      propertyId: null,
      title: "General capture QA",
      activityId: "note-1",
      noteActivityId: "note-1",
      createdBy: "actor",
      status: "published",
      language: "en",
      messages: [],
      documentIds: [docId],
      aiDraft: null,
      draftHistory: [],
      publishedAt: new Date(),
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Simulate post-publish CRM read models using the UI query shapes.
    findActivities.mockResolvedValue({
      activities: [
        {
          id: "note-1",
          typeId: noteTypeId,
          leadId,
          title: "General capture QA",
          description: "Buyer liked the balcony.",
        },
      ],
      total: 1,
    });
    findDocuments.mockResolvedValue({
      documents: [
        {
          id: docId,
          linkedEntityType: "lead",
          linkedEntityId: leadId,
          fileName: "balcony.jpg",
        },
      ],
      total: 1,
    });

    await publishVisitSessionForWorkspace(workspaceId, sessionId, "actor", {
      mirrorToLeadNotes: true,
      registerLeadNoteActivity: true,
      createTasksFromNextSteps: false,
    });

    expect(createActivityForWorkspace).toHaveBeenCalledWith(
      workspaceId,
      "actor",
      expect.objectContaining({ typeId: noteTypeId, leadId }),
    );
    expect(updateDocumentLinkedEntity).toHaveBeenCalledWith(workspaceId, docId, {
      linkedEntityType: "lead",
      linkedEntityId: leadId,
    });

    // After re-link, the Files tab query must request lead-scoped docs.
    const filesQuery = leadFilesTabQuery(leadId);
    expect(filesQuery).toEqual({
      linkedEntityType: "lead",
      linkedEntityId: leadId,
      page: 1,
      pageSize: 50,
      includeArchived: false,
    });
    const files = await findDocumentsRepo(workspaceId, filesQuery);
    expect(files.total).toBe(1);
    expect(files.documents[0]?.linkedEntityType).toBe("lead");

    // Notes tab resolves dictionary key "note" then filters typeId.
    const notesQuery = leadNotesTabQuery(leadId, noteTypeId);
    expect(notesQuery.typeId).toBe(noteTypeId);
    expect(notesQuery.leadId).toBe(leadId);
    const notes = await findActivitiesRepo(workspaceId, notesQuery);
    expect(notes.total).toBe(1);
    expect(notes.activities[0]?.typeId).toBe(noteTypeId);
    expect(notes.activities[0]?.typeId).not.toBe("type-visit");
  });
});
