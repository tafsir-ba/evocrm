import { beforeEach, describe, expect, it, vi } from "vitest";

const requireProjectAccess = vi.fn();
const assertRecordProjectAccess = vi.fn();
const applyUserProjectScope = vi.fn();
const resolveWorkspaceAccess = vi.fn();
const hasPermission = vi.fn();
const findVisitSessionById = vi.fn();
const archiveVisitSession = vi.fn();
const archiveDocument = vi.fn();
const findDocumentById = vi.fn();
const updateDocumentLinkedEntity = vi.fn();
const findLeadById = vi.fn();
const updateLead = vi.fn();
const findProjectById = vi.fn();
const createAuditLog = vi.fn();
const findActivityById = vi.fn();

vi.mock("@/server/permissions/require-project-access", () => ({
  requireProjectAccess: (...args: unknown[]) => requireProjectAccess(...args),
}));

vi.mock("@/server/services/apply-project-scope", () => ({
  applyUserProjectScope: (...args: unknown[]) => applyUserProjectScope(...args),
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
  archiveVisitSession: (...args: unknown[]) => archiveVisitSession(...args),
  createVisitSession: vi.fn(),
  findVisitSessions: vi.fn(),
  updateVisitSession: vi.fn(),
}));

vi.mock("@/server/repositories/documents", () => ({
  archiveDocument: (...args: unknown[]) => archiveDocument(...args),
  findDocumentById: (...args: unknown[]) => findDocumentById(...args),
  updateDocumentLinkedEntity: (...args: unknown[]) => updateDocumentLinkedEntity(...args),
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
}));

vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: (...args: unknown[]) => createAuditLog(...args),
}));

vi.mock("@/server/services/activities", () => ({
  createActivityForWorkspace: vi.fn(),
  updateActivityForWorkspace: vi.fn(),
}));

vi.mock("@/server/services/visit-notes-ai", () => ({
  summarizeVisitSessionWithOpenAi: vi.fn(),
  transcribeAudioWithOpenAi: vi.fn(),
}));

vi.mock("@/server/storage/spaces", () => ({
  getObjectBuffer: vi.fn(),
}));

vi.mock("@/server/repositories/dictionary-items", () => ({
  findDictionaryItemByTypeAndKey: vi.fn(),
}));

import { AppError } from "@/server/errors";
import { findDictionaryItemByTypeAndKey } from "@/server/repositories/dictionary-items";
import { updateVisitSession } from "@/server/repositories/visit-sessions";
import {
  createActivityForWorkspace,
  updateActivityForWorkspace,
} from "@/server/services/activities";
import {
  archiveVisitSessionForWorkspace,
  publishVisitSessionForWorkspace,
} from "@/server/services/visit-sessions";

const mockedFindDictionary = vi.mocked(findDictionaryItemByTypeAndKey);
const mockedCreateActivity = vi.mocked(createActivityForWorkspace);
const mockedUpdateActivity = vi.mocked(updateActivityForWorkspace);
const mockedUpdateVisitSession = vi.mocked(updateVisitSession);

const baseSession = {
  id: "507f1f77bcf86cd799439013",
  workspaceId: "507f1f77bcf86cd799439001",
  leadId: "507f1f77bcf86cd799439011",
  projectId: "507f1f77bcf86cd799439012",
  propertyId: null as string | null,
  title: "Parking follow-up" as string | null,
  activityId: null as string | null,
  noteActivityId: null as string | null,
  createdBy: "507f1f77bcf86cd799439099",
  status: "draft" as const,
  language: "en",
  messages: [],
  documentIds: ["507f1f77bcf86cd799439021", "507f1f77bcf86cd799439022"],
  aiDraft: {
    version: 1,
    summary: "Summary",
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
  publishedAt: null as Date | null,
  archivedAt: null as Date | null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function mockDictionaries() {
  mockedFindDictionary.mockImplementation(async (_ws, type, key) => {
    if (type === "activity_type" && key === "note") {
      return { id: "type-note", key: "note", label: "Note" } as never;
    }
    if (type === "activity_type" && key === "visit") {
      return { id: "type-visit", key: "visit", label: "Visit" } as never;
    }
    if (type === "activity_status" && key === "completed") {
      return { id: "status-done", key: "completed", label: "Completed" } as never;
    }
    return null;
  });
}

describe("visit-sessions publish lead surface", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertRecordProjectAccess.mockResolvedValue(undefined);
    findLeadById.mockResolvedValue({
      id: baseSession.leadId,
      fullName: "Ada",
      email: "ada@example.com",
      notes: "Prior",
      projectId: baseSession.projectId,
      archivedAt: null,
    });
    findProjectById.mockResolvedValue({
      id: baseSession.projectId,
      name: "Cressy",
      workspaceId: baseSession.workspaceId,
    });
    findActivityById.mockResolvedValue(null);
    hasPermission.mockImplementation(
      (permissions: string[], required: string) => permissions.includes(required),
    );
    resolveWorkspaceAccess.mockResolvedValue({
      mode: "member",
      membership: null,
      permissions: ["activity:update", "activity:create", "lead:update"],
      isWorkspaceAdmin: false,
      grantedProjectIds: null,
    });
  });

  it("refuses mirrorToLeadNotes without lead:update", async () => {
    findVisitSessionById.mockResolvedValue(baseSession);
    resolveWorkspaceAccess.mockResolvedValue({
      mode: "member",
      membership: null,
      permissions: ["activity:update", "activity:create"],
      isWorkspaceAdmin: false,
      grantedProjectIds: null,
    });

    await expect(
      publishVisitSessionForWorkspace(baseSession.workspaceId, baseSession.id, "actor", {
        mirrorToLeadNotes: true,
        registerLeadNoteActivity: true,
        createTasksFromNextSteps: false,
      }),
    ).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
    } satisfies Partial<AppError>);

    expect(updateLead).not.toHaveBeenCalled();
    expect(mockedCreateActivity).not.toHaveBeenCalled();
  });

  it("publishes a Note activity (not Visit) and re-links media to the lead", async () => {
    const docId = baseSession.documentIds[0]!;
    findVisitSessionById.mockResolvedValue({
      ...baseSession,
      documentIds: [docId],
    });
    mockDictionaries();
    findDocumentById.mockResolvedValue({
      id: docId,
      fileName: "clip.mp4",
      mimeType: "video/mp4",
      archivedAt: null,
      linkedEntityType: "visit_session",
      linkedEntityId: baseSession.id,
    });
    mockedCreateActivity.mockResolvedValue({ id: "note-act" } as never);
    mockedUpdateVisitSession.mockResolvedValue({
      ...baseSession,
      activityId: "note-act",
      noteActivityId: "note-act",
      status: "published",
      publishedAt: new Date(),
      documentIds: [docId],
    } as never);

    await publishVisitSessionForWorkspace(baseSession.workspaceId, baseSession.id, "actor", {
      mirrorToLeadNotes: true,
      registerLeadNoteActivity: true,
      createTasksFromNextSteps: false,
    });

    expect(mockedCreateActivity).toHaveBeenCalledTimes(1);
    expect(mockedCreateActivity).toHaveBeenCalledWith(
      baseSession.workspaceId,
      "actor",
      expect.objectContaining({
        typeId: "type-note",
        leadId: baseSession.leadId,
        statusId: "status-done",
      }),
    );
    expect(updateDocumentLinkedEntity).toHaveBeenCalledWith(
      baseSession.workspaceId,
      docId,
      {
        linkedEntityType: "lead",
        linkedEntityId: baseSession.leadId,
      },
    );
    expect(updateLead).toHaveBeenCalledWith(
      baseSession.workspaceId,
      baseSession.leadId,
      expect.objectContaining({
        notes: expect.stringContaining(`[Note session:${baseSession.id}]`),
      }),
    );
    expect(mockedUpdateVisitSession).toHaveBeenCalledWith(
      baseSession.workspaceId,
      baseSession.id,
      expect.objectContaining({
        activityId: "note-act",
        noteActivityId: "note-act",
      }),
    );
  });

  it("is idempotent: republish updates the same Note and does not duplicate Lead.notes", async () => {
    const noteId = "note-act-existing";
    findVisitSessionById.mockResolvedValue({
      ...baseSession,
      activityId: noteId,
      noteActivityId: noteId,
      publishedAt: new Date(),
      documentIds: [],
    });
    mockDictionaries();
    findLeadById.mockResolvedValue({
      id: baseSession.leadId,
      fullName: "Ada",
      email: "ada@example.com",
      notes: `Prior\n\n[Note session:${baseSession.id}]\nOld summary`,
      projectId: baseSession.projectId,
      archivedAt: null,
    });
    mockedUpdateVisitSession.mockResolvedValue({
      ...baseSession,
      activityId: noteId,
      noteActivityId: noteId,
      status: "amended",
      publishedAt: new Date(),
    } as never);

    await publishVisitSessionForWorkspace(baseSession.workspaceId, baseSession.id, "actor", {
      mirrorToLeadNotes: true,
      registerLeadNoteActivity: true,
      createTasksFromNextSteps: false,
    });

    expect(mockedCreateActivity).not.toHaveBeenCalled();
    expect(mockedUpdateActivity).toHaveBeenCalledWith(
      baseSession.workspaceId,
      noteId,
      "actor",
      expect.objectContaining({ title: "Parking follow-up" }),
    );
    const mirrored = updateLead.mock.calls[0]?.[2]?.notes as string;
    expect(mirrored.match(/\[Note session:/g)?.length).toBe(1);
    expect(mirrored).toContain("Summary");
    expect(mirrored).not.toContain("Old summary");
  });

  it("reuses activityId when it already points at a Note type", async () => {
    findVisitSessionById.mockResolvedValue({
      ...baseSession,
      activityId: "legacy-note",
      noteActivityId: null,
      documentIds: [],
    });
    mockDictionaries();
    findActivityById.mockResolvedValue({
      id: "legacy-note",
      typeId: "type-note",
      archivedAt: null,
    });
    mockedUpdateVisitSession.mockResolvedValue({
      ...baseSession,
      activityId: "legacy-note",
      noteActivityId: "legacy-note",
      status: "published",
      publishedAt: new Date(),
    } as never);

    await publishVisitSessionForWorkspace(baseSession.workspaceId, baseSession.id, "actor", {
      mirrorToLeadNotes: false,
      registerLeadNoteActivity: true,
      createTasksFromNextSteps: false,
    });

    expect(mockedCreateActivity).not.toHaveBeenCalled();
    expect(mockedUpdateActivity).toHaveBeenCalledWith(
      baseSession.workspaceId,
      "legacy-note",
      "actor",
      expect.any(Object),
    );
  });

  it("archives only documents still linked to the visit session before soft-archiving", async () => {
    findVisitSessionById.mockResolvedValue(baseSession);
    findDocumentById
      .mockResolvedValueOnce({
        id: baseSession.documentIds[0],
        archivedAt: null,
        linkedEntityType: "visit_session",
        linkedEntityId: baseSession.id,
      })
      .mockResolvedValueOnce({
        id: baseSession.documentIds[1],
        archivedAt: null,
        linkedEntityType: "visit_session",
        linkedEntityId: baseSession.id,
      });
    archiveDocument.mockResolvedValue({ id: "doc" });
    archiveVisitSession.mockResolvedValue({
      ...baseSession,
      status: "archived",
      archivedAt: new Date(),
      documentIds: baseSession.documentIds,
    });

    await archiveVisitSessionForWorkspace(
      baseSession.workspaceId,
      baseSession.id,
      "actor",
    );

    expect(archiveDocument).toHaveBeenCalledTimes(2);
  });

  it("does not cascade-archive documents re-linked to the lead after publish", async () => {
    findVisitSessionById.mockResolvedValue(baseSession);
    findDocumentById
      .mockResolvedValueOnce({
        id: baseSession.documentIds[0],
        archivedAt: null,
        linkedEntityType: "lead",
        linkedEntityId: baseSession.leadId,
      })
      .mockResolvedValueOnce({
        id: baseSession.documentIds[1],
        archivedAt: null,
        linkedEntityType: "lead",
        linkedEntityId: baseSession.leadId,
      });
    archiveVisitSession.mockResolvedValue({
      ...baseSession,
      status: "archived",
      archivedAt: new Date(),
      documentIds: baseSession.documentIds,
    });

    await archiveVisitSessionForWorkspace(
      baseSession.workspaceId,
      baseSession.id,
      "actor",
    );

    expect(archiveDocument).not.toHaveBeenCalled();
  });
});
