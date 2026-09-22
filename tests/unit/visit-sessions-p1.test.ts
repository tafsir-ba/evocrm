import { beforeEach, describe, expect, it, vi } from "vitest";

const requireProjectAccess = vi.fn();
const assertRecordProjectAccess = vi.fn();
const applyUserProjectScope = vi.fn();
const resolveWorkspaceAccess = vi.fn();
const hasPermission = vi.fn();
const findVisitSessionById = vi.fn();
const archiveVisitSession = vi.fn();
const archiveDocument = vi.fn();
const findLeadById = vi.fn();
const updateLead = vi.fn();
const findProjectById = vi.fn();
const createAuditLog = vi.fn();

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
  findDocumentById: vi.fn(),
}));

vi.mock("@/server/repositories/leads", () => ({
  findLeadById: (...args: unknown[]) => findLeadById(...args),
  updateLead: (...args: unknown[]) => updateLead(...args),
}));

vi.mock("@/server/repositories/projects", () => ({
  findProjectById: (...args: unknown[]) => findProjectById(...args),
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
const mockedUpdateVisitSession = vi.mocked(updateVisitSession);
const baseSession = {
  id: "507f1f77bcf86cd799439013",
  workspaceId: "507f1f77bcf86cd799439001",
  leadId: "507f1f77bcf86cd799439011",
  projectId: "507f1f77bcf86cd799439012",
  activityId: null,
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
  publishedAt: null,
  archivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("visit-sessions P1 permission and archive integrity", () => {
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
    hasPermission.mockImplementation(
      (permissions: string[], required: string) => permissions.includes(required),
    );

    await expect(
      publishVisitSessionForWorkspace(baseSession.workspaceId, baseSession.id, "actor", {
        mirrorToLeadNotes: true,
        createTasksFromNextSteps: false,
      }),
    ).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
    } satisfies Partial<AppError>);

    expect(updateLead).not.toHaveBeenCalled();
  });

  it("registers a note Activity on the lead Notes profile when publishing", async () => {
    findVisitSessionById.mockResolvedValue(baseSession);
    resolveWorkspaceAccess.mockResolvedValue({
      mode: "member",
      membership: null,
      permissions: ["activity:update", "activity:create", "lead:update"],
      isWorkspaceAdmin: false,
      grantedProjectIds: null,
    });
    hasPermission.mockImplementation(
      (permissions: string[], required: string) => permissions.includes(required),
    );
    mockedFindDictionary.mockImplementation(async (_ws, type, key) => {
      if (type === "activity_type" && key === "visit") {
        return { id: "type-visit", key: "visit", label: "Visit" };
      }
      if (type === "activity_type" && key === "note") {
        return { id: "type-note", key: "note", label: "Note" };
      }
      if (type === "activity_status" && key === "completed") {
        return { id: "status-done", key: "completed", label: "Completed" };
      }
      return null;
    });
    mockedCreateActivity
      .mockResolvedValueOnce({ id: "visit-act" } as never)
      .mockResolvedValueOnce({ id: "note-act" } as never);
    mockedUpdateVisitSession.mockResolvedValue({
      ...baseSession,
      activityId: "visit-act",
      status: "published",
      publishedAt: new Date(),
    });

    await publishVisitSessionForWorkspace(baseSession.workspaceId, baseSession.id, "actor", {
      mirrorToLeadNotes: true,
      registerLeadNoteActivity: true,
      createTasksFromNextSteps: false,
    });

    expect(mockedCreateActivity).toHaveBeenCalledTimes(2);
    expect(mockedCreateActivity).toHaveBeenNthCalledWith(
      1,
      baseSession.workspaceId,
      "actor",
      expect.objectContaining({ typeId: "type-visit", leadId: baseSession.leadId }),
    );
    expect(mockedCreateActivity).toHaveBeenNthCalledWith(
      2,
      baseSession.workspaceId,
      "actor",
      expect.objectContaining({
        typeId: "type-note",
        leadId: baseSession.leadId,
        statusId: "status-done",
      }),
    );
    expect(updateLead).toHaveBeenCalledWith(
      baseSession.workspaceId,
      baseSession.leadId,
      expect.objectContaining({ notes: expect.stringContaining("[Visit ") }),
    );
    expect(updateActivityForWorkspace).not.toHaveBeenCalled();
  });

  it("archives linked documents before soft-archiving the session", async () => {
    findVisitSessionById.mockResolvedValue(baseSession);
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
    expect(archiveDocument).toHaveBeenNthCalledWith(
      1,
      baseSession.workspaceId,
      baseSession.documentIds[0],
    );
    expect(archiveDocument).toHaveBeenNthCalledWith(
      2,
      baseSession.workspaceId,
      baseSession.documentIds[1],
    );
    expect(archiveVisitSession).toHaveBeenCalledWith(
      baseSession.workspaceId,
      baseSession.id,
    );
    const archiveDocOrder = archiveDocument.mock.invocationCallOrder[0]!;
    const archiveSessionOrder = archiveVisitSession.mock.invocationCallOrder[0]!;
    expect(archiveDocOrder).toBeLessThan(archiveSessionOrder);
  });
});
