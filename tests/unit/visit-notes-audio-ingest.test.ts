import { beforeEach, describe, expect, it, vi } from "vitest";

const assertRecordProjectAccess = vi.fn();
const resolveWorkspaceAccess = vi.fn();
const hasPermission = vi.fn();
const findVisitSessionById = vi.fn();
const updateVisitSession = vi.fn();
const findDocumentById = vi.fn();
const createAuditLog = vi.fn();
const getObjectBuffer = vi.fn();
const transcribeAudioWithOpenAi = vi.fn();

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
  archiveVisitSession: vi.fn(),
  createVisitSession: vi.fn(),
  findVisitSessions: vi.fn(),
}));

vi.mock("@/server/repositories/documents", () => ({
  findDocumentById: (...args: unknown[]) => findDocumentById(...args),
  archiveDocument: vi.fn(),
  updateDocumentLinkedEntity: vi.fn(),
}));

vi.mock("@/server/repositories/leads", () => ({
  findLeadById: vi.fn(),
  updateLead: vi.fn(),
}));

vi.mock("@/server/repositories/projects", () => ({
  findProjectById: vi.fn(),
}));

vi.mock("@/server/repositories/properties", () => ({
  findPropertyById: vi.fn(),
}));

vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: (...args: unknown[]) => createAuditLog(...args),
}));

vi.mock("@/server/services/visit-notes-ai", () => ({
  summarizeVisitSessionWithOpenAi: vi.fn(),
  transcribeAudioWithOpenAi: (...args: unknown[]) => transcribeAudioWithOpenAi(...args),
}));

vi.mock("@/server/storage/spaces", () => ({
  getObjectBuffer: (...args: unknown[]) => getObjectBuffer(...args),
}));

import { AppError } from "@/server/errors";
import {
  isVisitAudioMimeType,
  isVisitMediaMimeType,
  validateVisitMediaFileClient,
  visitMediaKindFromMime,
} from "@/lib/visit-notes";
import { documentUploadUrlInputSchema } from "@/server/validation/documents";
import { appendVisitMessageInputSchema } from "@/server/validation/visit-sessions";
import { transcribeVisitMessageForWorkspace } from "@/server/services/visit-sessions";

const workspaceId = "507f1f77bcf86cd799439001";
const sessionId = "507f1f77bcf86cd799439013";
const actorId = "507f1f77bcf86cd799439099";
const documentId = "507f1f77bcf86cd799439088";
const messageId = "msg-audio-1";

const baseSession = {
  id: sessionId,
  workspaceId,
  leadId: "507f1f77bcf86cd799439011",
  projectId: "507f1f77bcf86cd799439012",
  propertyId: null,
  title: null,
  activityId: null,
  noteActivityId: null,
  createdBy: actorId,
  status: "open" as const,
  language: null,
  messages: [
    {
      id: messageId,
      kind: "audio" as const,
      text: null,
      documentId,
      language: null,
      status: "ready" as const,
      error: null,
      createdBy: actorId,
      createdAt: new Date("2026-09-22T19:00:00.000Z"),
    },
  ],
  documentIds: [documentId],
  aiDraft: null,
  draftHistory: [],
  publishedAt: null,
  archivedAt: null,
  createdAt: new Date("2026-09-22T19:00:00.000Z"),
  updatedAt: new Date("2026-09-22T19:00:00.000Z"),
};

describe("notes audio file ingestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveWorkspaceAccess.mockResolvedValue({
      permissions: ["activity:update", "activity:read"],
    });
    hasPermission.mockImplementation((_access: unknown, permission: string) =>
      ["activity:update", "activity:read"].includes(permission),
    );
    assertRecordProjectAccess.mockResolvedValue(undefined);
    findVisitSessionById.mockResolvedValue(baseSession);
    findDocumentById.mockResolvedValue({
      id: documentId,
      workspaceId,
      mimeType: "audio/mp4",
      fileName: "note.m4a",
      status: "active",
      storageKey: "ws/visit/note.m4a",
      archivedAt: null,
      linkedEntityType: "visit_session",
      linkedEntityId: sessionId,
    });
    getObjectBuffer.mockResolvedValue({ body: Buffer.from("fake-audio") });
    transcribeAudioWithOpenAi.mockResolvedValue({
      text: "Hello from the audio file",
      language: "en",
    });
    updateVisitSession.mockImplementation(async (_ws: string, _id: string, update: Record<string, unknown>) => ({
      ...baseSession,
      ...update,
      messages: (update.messages as typeof baseSession.messages) ?? baseSession.messages,
    }));
  });

  it("permits supported audio MIME/size and denies unsupported types", () => {
    expect(isVisitAudioMimeType("audio/mp4")).toBe(true);
    expect(isVisitAudioMimeType("audio/mpeg")).toBe(true);
    expect(visitMediaKindFromMime("audio/webm")).toBe("audio");
    expect(isVisitMediaMimeType("text/plain")).toBe(false);
    expect(
      validateVisitMediaFileClient({
        name: "clip.txt",
        type: "text/plain",
        size: 12,
      } as File),
    ).toMatch(/unsupported/i);

    expect(
      documentUploadUrlInputSchema.safeParse({
        linkedEntityType: "visit_session",
        linkedEntityId: sessionId,
        fileName: "note.m4a",
        mimeType: "audio/mp4",
        fileSize: 1024,
        visibility: "private",
      }).success,
    ).toBe(true);

    expect(
      documentUploadUrlInputSchema.safeParse({
        linkedEntityType: "visit_session",
        linkedEntityId: sessionId,
        fileName: "note.exe",
        mimeType: "application/x-msdownload",
        fileSize: 1024,
        visibility: "private",
      }).success,
    ).toBe(false);

    expect(
      appendVisitMessageInputSchema.safeParse({
        kind: "audio",
        documentId,
        text: null,
      }).success,
    ).toBe(true);
  });

  it("transcribes audio onto the same message (no duplicate transcript row)", async () => {
    const result = await transcribeVisitMessageForWorkspace(
      workspaceId,
      sessionId,
      actorId,
      { messageId, language: null },
    );

    expect(transcribeAudioWithOpenAi).toHaveBeenCalled();
    const lastUpdate = updateVisitSession.mock.calls.at(-1)?.[2] as {
      messages: Array<{ id: string; kind: string; text: string | null }>;
    };
    expect(lastUpdate.messages.filter((m) => m.kind === "transcript")).toHaveLength(0);
    expect(lastUpdate.messages).toHaveLength(1);
    expect(lastUpdate.messages[0]).toMatchObject({
      id: messageId,
      kind: "audio",
      text: "Hello from the audio file",
    });
    expect(result.messages[0]?.text).toBe("Hello from the audio file");
  });

  it("marks transcription failure as retryable while preserving source audio", async () => {
    transcribeAudioWithOpenAi.mockRejectedValueOnce(
      new AppError("INTERNAL_ERROR", "Audio transcription failed.", { expose: true }),
    );

    await expect(
      transcribeVisitMessageForWorkspace(workspaceId, sessionId, actorId, {
        messageId,
      }),
    ).rejects.toBeInstanceOf(AppError);

    const failedUpdate = updateVisitSession.mock.calls.at(-1)?.[2] as {
      messages: Array<{ status: string; error: string | null; documentId: string | null }>;
    };
    expect(failedUpdate.messages[0]?.status).toBe("failed");
    expect(failedUpdate.messages[0]?.documentId).toBe(documentId);
    expect(failedUpdate.messages[0]?.error).toMatch(/transcription failed|retry/i);
  });

  it("rejects transcription when the actor lacks authorization", async () => {
    assertRecordProjectAccess.mockRejectedValueOnce(
      new AppError("PERMISSION_DENIED", "Missing project access."),
    );

    await expect(
      transcribeVisitMessageForWorkspace(workspaceId, sessionId, actorId, {
        messageId,
      }),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect(transcribeAudioWithOpenAi).not.toHaveBeenCalled();
  });

  it("rejects non-audio documents on the transcription path", async () => {
    findDocumentById.mockResolvedValue({
      id: documentId,
      workspaceId,
      mimeType: "video/mp4",
      fileName: "clip.mp4",
      status: "active",
      storageKey: "ws/visit/clip.mp4",
      archivedAt: null,
      linkedEntityType: "visit_session",
      linkedEntityId: sessionId,
    });

    await expect(
      transcribeVisitMessageForWorkspace(workspaceId, sessionId, actorId, {
        messageId,
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
});
