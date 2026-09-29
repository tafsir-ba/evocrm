import { beforeEach, describe, expect, it, vi } from "vitest";

const requireProjectAccess = vi.fn();
const assertRecordProjectAccess = vi.fn();
const applyUserProjectScope = vi.fn();
const resolveWorkspaceAccess = vi.fn();
const hasPermission = vi.fn();
const findVisitSessionById = vi.fn();
const createVisitSession = vi.fn();
const findVisitSessions = vi.fn();
const updateVisitSession = vi.fn();
const findLeadById = vi.fn();
const findProjectById = vi.fn();
const findPropertyById = vi.fn();
const createAuditLog = vi.fn();
const findAllOpportunities = vi.fn();
const createOpportunityForWorkspace = vi.fn();
const findDictionaryItemByTypeAndKey = vi.fn();
const findDictionaryItemByTypeAndBehavior = vi.fn();

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
  createVisitSession: (...args: unknown[]) => createVisitSession(...args),
  findVisitSessions: (...args: unknown[]) => findVisitSessions(...args),
  updateVisitSession: (...args: unknown[]) => updateVisitSession(...args),
  archiveVisitSession: vi.fn(),
}));

vi.mock("@/server/repositories/leads", () => ({
  findLeadById: (...args: unknown[]) => findLeadById(...args),
  updateLead: vi.fn(),
}));

vi.mock("@/server/repositories/projects", () => ({
  findProjectById: (...args: unknown[]) => findProjectById(...args),
}));

vi.mock("@/server/repositories/properties", () => ({
  findPropertyById: (...args: unknown[]) => findPropertyById(...args),
}));

vi.mock("@/server/repositories/opportunities", () => ({
  findAllOpportunities: (...args: unknown[]) => findAllOpportunities(...args),
}));

vi.mock("@/server/services/opportunities", () => ({
  createOpportunityForWorkspace: (...args: unknown[]) =>
    createOpportunityForWorkspace(...args),
}));

vi.mock("@/server/repositories/dictionary-items", () => ({
  findDictionaryItemByTypeAndKey: (...args: unknown[]) =>
    findDictionaryItemByTypeAndKey(...args),
  findDictionaryItemByTypeAndBehavior: (...args: unknown[]) =>
    findDictionaryItemByTypeAndBehavior(...args),
}));

vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: (...args: unknown[]) => createAuditLog(...args),
}));

vi.mock("@/server/repositories/documents", () => ({
  archiveDocument: vi.fn(),
  findDocumentById: vi.fn(),
  updateDocumentLinkedEntity: vi.fn(),
}));

vi.mock("@/server/repositories/activities", () => ({
  findActivityById: vi.fn(),
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

import {
  createVisitSessionForWorkspace,
  listVisitSessionsForWorkspace,
  updateVisitSessionForWorkspace,
} from "@/server/services/visit-sessions";

const workspaceId = "507f1f77bcf86cd799439001";
const actorId = "507f1f77bcf86cd799439099";
const leadId = "507f1f77bcf86cd799439011";
const projectId = "507f1f77bcf86cd799439012";
const propertyId = "507f1f77bcf86cd799439033";

const personalSession = {
  id: "507f1f77bcf86cd799439013",
  workspaceId,
  leadId: null as string | null,
  projectId: null as string | null,
  propertyId: null as string | null,
  title: null as string | null,
  activityId: null,
  noteActivityId: null,
  createdBy: actorId,
  status: "open" as const,
  language: null,
  messages: [],
  documentIds: [],
  aiDraft: null,
  draftHistory: [],
  publishedAt: null,
  archivedAt: null,
  createdAt: new Date("2026-09-29T10:00:00.000Z"),
  updatedAt: new Date("2026-09-29T10:00:00.000Z"),
};

describe("visit-sessions personal notes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasPermission.mockImplementation(
      (permissions: string[], required: string) => permissions.includes(required),
    );
    resolveWorkspaceAccess.mockResolvedValue({
      permissions: ["activity:read", "activity:create", "activity:update", "opportunity:create"],
      isWorkspaceAdmin: true,
      mode: "member",
      membership: null,
    });
    findLeadById.mockResolvedValue(null);
    findProjectById.mockResolvedValue(null);
    findPropertyById.mockResolvedValue(null);
    findAllOpportunities.mockResolvedValue([]);
    findDictionaryItemByTypeAndBehavior.mockResolvedValue({
      id: "status-open",
      key: "new",
      behavior: "open",
    });
    findDictionaryItemByTypeAndKey.mockResolvedValue(null);
  });

  it("creates a personal note without lead or project", async () => {
    createVisitSession.mockResolvedValue(personalSession);

    const created = await createVisitSessionForWorkspace(workspaceId, actorId, {
      leadId: null,
    });

    expect(createVisitSession).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId,
        leadId: null,
        projectId: null,
        createdBy: actorId,
      }),
    );
    expect(created.leadId).toBeNull();
    expect(created.lead).toBeNull();
    expect(requireProjectAccess).not.toHaveBeenCalled();
  });

  it("lists personal notes with mine filter", async () => {
    findVisitSessions.mockResolvedValue({ sessions: [personalSession], total: 1 });

    const result = await listVisitSessionsForWorkspace(
      workspaceId,
      { mine: true, page: 1, pageSize: 20, includeArchived: false },
      actorId,
    );

    expect(findVisitSessions).toHaveBeenCalledWith(
      workspaceId,
      expect.objectContaining({
        createdBy: actorId,
        unassignedOnly: true,
      }),
    );
    expect(result.total).toBe(1);
    expect(applyUserProjectScope).not.toHaveBeenCalled();
  });

  it("excludes unassigned personal notes from shared non-mine lists", async () => {
    applyUserProjectScope.mockResolvedValue({ projectIds: [projectId] });
    findVisitSessions.mockResolvedValue({ sessions: [], total: 0 });

    await listVisitSessionsForWorkspace(
      workspaceId,
      { page: 1, pageSize: 20, includeArchived: false, mine: false },
      actorId,
    );

    expect(findVisitSessions).toHaveBeenCalledWith(
      workspaceId,
      expect.objectContaining({
        excludeUnassigned: true,
        projectIds: [projectId],
      }),
    );
  });

  it("attributes a buyer and unit and upserts a CRM opportunity", async () => {
    findVisitSessionById.mockResolvedValue(personalSession);
    findLeadById.mockResolvedValue({
      id: leadId,
      fullName: "Ada Buyer",
      email: "ada@example.com",
      projectId,
      archivedAt: null,
    });
    findPropertyById.mockResolvedValue({
      id: propertyId,
      title: "A1",
      reference: "A1",
      projectId,
      archivedAt: null,
    });
    findProjectById.mockResolvedValue({ id: projectId, name: "Cressy" });
    requireProjectAccess.mockResolvedValue({});
    assertRecordProjectAccess.mockResolvedValue(undefined);

    const linked = {
      ...personalSession,
      leadId,
      projectId,
      propertyId,
      status: "open" as const,
    };
    updateVisitSession.mockResolvedValue(linked);
    createOpportunityForWorkspace.mockResolvedValue({ id: "opp-1" });

    const result = await updateVisitSessionForWorkspace(
      workspaceId,
      personalSession.id,
      actorId,
      { leadId, propertyId },
    );

    expect(updateVisitSession).toHaveBeenCalledWith(
      workspaceId,
      personalSession.id,
      expect.objectContaining({
        leadId,
        projectId,
        propertyId,
      }),
    );
    expect(createOpportunityForWorkspace).toHaveBeenCalledWith(
      workspaceId,
      actorId,
      expect.objectContaining({
        leadId,
        propertyId,
        statusId: "status-open",
      }),
    );
    expect(result.leadId).toBe(leadId);
    expect(result.propertyId).toBe(propertyId);
  });

  it("rejects buyer+unit link when opportunity:create is missing", async () => {
    findVisitSessionById.mockResolvedValue(personalSession);
    findLeadById.mockResolvedValue({
      id: leadId,
      fullName: "Ada Buyer",
      email: "ada@example.com",
      projectId,
      archivedAt: null,
    });
    findPropertyById.mockResolvedValue({
      id: propertyId,
      title: "A1",
      reference: "A1",
      projectId,
      archivedAt: null,
    });
    requireProjectAccess.mockResolvedValue({});
    assertRecordProjectAccess.mockResolvedValue(undefined);
    findAllOpportunities.mockResolvedValue([]);
    resolveWorkspaceAccess.mockResolvedValue({
      permissions: ["activity:read", "activity:create", "activity:update"],
      isWorkspaceAdmin: true,
      mode: "member",
      membership: null,
    });

    await expect(
      updateVisitSessionForWorkspace(workspaceId, personalSession.id, actorId, {
        leadId,
        propertyId,
      }),
    ).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
      message: expect.stringMatching(/opportunity:create/i),
    });
    expect(updateVisitSession).not.toHaveBeenCalled();
  });

  it("does not create a duplicate opportunity when one already exists", async () => {
    findVisitSessionById.mockResolvedValue({
      ...personalSession,
      leadId,
      projectId,
    });
    findPropertyById.mockResolvedValue({
      id: propertyId,
      title: "A1",
      reference: "A1",
      projectId,
      archivedAt: null,
    });
    findLeadById.mockResolvedValue({
      id: leadId,
      fullName: "Ada",
      email: null,
      projectId,
      archivedAt: null,
    });
    findProjectById.mockResolvedValue({ id: projectId, name: "Cressy" });
    assertRecordProjectAccess.mockResolvedValue(undefined);
    findAllOpportunities.mockResolvedValue([{ id: "opp-existing" }]);
    updateVisitSession.mockResolvedValue({
      ...personalSession,
      leadId,
      projectId,
      propertyId,
    });

    await updateVisitSessionForWorkspace(workspaceId, personalSession.id, actorId, {
      propertyId,
    });

    expect(createOpportunityForWorkspace).not.toHaveBeenCalled();
  });
});
