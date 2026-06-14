import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/feedback", () => ({
  createFeedback: vi.fn(),
  findFeedbackById: vi.fn(),
  listFeedback: vi.fn(),
  countOpenFeedback: vi.fn(),
  updateFeedbackStatus: vi.fn(),
  deleteFeedback: vi.fn(),
  getFeedbackStatusCounts: vi.fn(),
}));

vi.mock("@/server/repositories/projects", () => ({
  findProjectById: vi.fn(),
}));

vi.mock("@/server/repositories/users", () => ({
  findUserById: vi.fn(),
}));

vi.mock("@/server/repositories/workspaces", () => ({
  findWorkspaceById: vi.fn(),
}));

vi.mock("@/server/workspaces/resolve-workspace", () => ({
  resolveWorkspace: vi.fn(),
}));

vi.mock("@/server/permissions/require-membership", () => ({
  requireMembership: vi.fn(),
}));

vi.mock("@/server/security/feedback-rate-limit", () => ({
  assertFeedbackRateLimit: vi.fn(),
}));

vi.mock("@/server/storage/spaces", () => ({
  isSpacesConfigured: vi.fn(),
  uploadObject: vi.fn(),
  deleteObject: vi.fn(),
  getObjectBuffer: vi.fn(),
}));

vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: vi.fn(),
}));

import { createAuditLog } from "@/server/audit/create-audit-log";
import {
  createFeedback,
  deleteFeedback,
  findFeedbackById,
  updateFeedbackStatus,
} from "@/server/repositories/feedback";
import { findProjectById } from "@/server/repositories/projects";
import { requireMembership } from "@/server/permissions/require-membership";
import { assertFeedbackRateLimit } from "@/server/security/feedback-rate-limit";
import {
  deleteFeedbackForAdmin,
  submitFeedbackForUser,
  updateFeedbackStatusForAdmin,
} from "@/server/services/feedback";
import { deleteObject, isSpacesConfigured } from "@/server/storage/spaces";
import { resolveWorkspace } from "@/server/workspaces/resolve-workspace";
import { AppError } from "@/server/errors";

const workspace = {
  id: "ws-1",
  slug: "demo",
  name: "Demo",
  timezone: "UTC",
  defaultCurrency: "USD",
};

const baseRecord = {
  id: "fb-1",
  userId: "user-1",
  userEmail: "reporter@example.com",
  userName: "Reporter",
  workspaceId: "ws-1",
  category: "bug" as const,
  body: "Broken button",
  projectId: null,
  pageUrl: "https://app.example/w/demo/leads",
  userAgent: "Mozilla/5.0",
  screenshots: [],
  status: "open" as const,
  createdAt: new Date("2026-06-14T10:00:00.000Z"),
  updatedAt: new Date("2026-06-14T10:00:00.000Z"),
  resolvedAt: null,
  resolvedBy: null,
};

describe("feedback service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveWorkspace).mockResolvedValue(workspace);
    vi.mocked(findProjectById).mockResolvedValue(null);
    vi.mocked(requireMembership).mockResolvedValue({
      id: "m-1",
      userId: "user-1",
      workspaceId: "ws-1",
      roleId: "role-1",
      status: "active",
      permissions: [],
    });
    vi.mocked(isSpacesConfigured).mockReturnValue(true);
  });

  it("persists feedback with session-derived workspace and ignores spoofed org fields", async () => {
    vi.mocked(createFeedback).mockResolvedValue(baseRecord);

    const result = await submitFeedbackForUser({
      userId: "user-1",
      userEmail: "reporter@example.com",
      userName: "Reporter",
      fields: {
        category: "bug",
        body: "Broken button",
        workspaceSlug: "demo",
        pageUrl: "https://app.example/w/demo/leads",
        userAgent: "Mozilla/5.0",
      },
      screenshots: [],
    });

    expect(assertFeedbackRateLimit).toHaveBeenCalledWith("user-1");
    expect(resolveWorkspace).toHaveBeenCalledWith("demo");
    expect(requireMembership).toHaveBeenCalledWith("ws-1", "user-1");
    expect(createFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        userEmail: "reporter@example.com",
        workspaceId: "ws-1",
        body: "Broken button",
      }),
    );
    expect(result).toEqual({ id: "fb-1" });
  });

  it("blocks empty submissions", async () => {
    await expect(
      submitFeedbackForUser({
        userId: "user-1",
        userEmail: "reporter@example.com",
        fields: {
          category: "bug",
          workspaceSlug: "demo",
        },
        screenshots: [],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("resolves feedback and writes audit log", async () => {
    vi.mocked(findFeedbackById)
      .mockResolvedValueOnce(baseRecord)
      .mockResolvedValueOnce({
        ...baseRecord,
        status: "resolved",
        resolvedAt: new Date("2026-06-14T11:00:00.000Z"),
        resolvedBy: "admin-1",
      });
    vi.mocked(updateFeedbackStatus).mockResolvedValue({
      ...baseRecord,
      status: "resolved",
      resolvedAt: new Date("2026-06-14T11:00:00.000Z"),
      resolvedBy: "admin-1",
    });

    await updateFeedbackStatusForAdmin({
      feedbackId: "fb-1",
      status: "resolved",
      adminUserId: "admin-1",
    });

    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "feedback.resolve",
        entityType: "feedback",
        entityId: "fb-1",
      }),
    );
  });

  it("deletes feedback row and storage keys", async () => {
    vi.mocked(findFeedbackById).mockResolvedValue({
      ...baseRecord,
      screenshots: [
        {
          storageKey: "feedback/fb-1/one.png",
          filename: "one.png",
          sizeBytes: 100,
          contentType: "image/png",
        },
      ],
    });
    vi.mocked(deleteFeedback).mockResolvedValue({
      ...baseRecord,
      screenshots: [
        {
          storageKey: "feedback/fb-1/one.png",
          filename: "one.png",
          sizeBytes: 100,
          contentType: "image/png",
        },
      ],
    });

    const deleted = await deleteFeedbackForAdmin({
      feedbackId: "fb-1",
      adminUserId: "admin-1",
    });

    expect(deleted).toBe(true);
    expect(deleteObject).toHaveBeenCalledWith("feedback/fb-1/one.png");
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "feedback.delete" }),
    );
  });

  it("rejects unsupported screenshot types", async () => {
    const file = new File(["abc"], "notes.txt", { type: "text/plain" });

    await expect(
      submitFeedbackForUser({
        userId: "user-1",
        userEmail: "reporter@example.com",
        fields: {
          category: "bug",
          workspaceSlug: "demo",
        },
        screenshots: [file],
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("ignores project_id that does not exist in the workspace", async () => {
    vi.mocked(findProjectById).mockResolvedValue(null);
    vi.mocked(createFeedback).mockResolvedValue(baseRecord);

    await submitFeedbackForUser({
      userId: "user-1",
      userEmail: "reporter@example.com",
      fields: {
        category: "bug",
        body: "Broken button",
        workspaceSlug: "demo",
        projectId: "507f1f77bcf86cd799439011",
      },
      screenshots: [],
    });

    expect(findProjectById).toHaveBeenCalledWith("ws-1", "507f1f77bcf86cd799439011");
    expect(createFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: null }),
    );
  });

  it("stores project_id when it exists in the workspace", async () => {
    vi.mocked(findProjectById).mockResolvedValue({
      id: "proj-1",
      workspaceId: "ws-1",
      name: "Project",
      reference: null,
      statusId: null,
      address: null,
      city: null,
      country: null,
      description: null,
      createdBy: "user-1",
      ownerId: null,
      assignedTo: null,
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(createFeedback).mockResolvedValue({
      ...baseRecord,
      projectId: "proj-1",
    });

    await submitFeedbackForUser({
      userId: "user-1",
      userEmail: "reporter@example.com",
      fields: {
        category: "bug",
        body: "Broken button",
        workspaceSlug: "demo",
        projectId: "proj-1",
      },
      screenshots: [],
    });

    expect(createFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "proj-1" }),
    );
  });

  it("reopens feedback and writes audit log", async () => {
    vi.mocked(findFeedbackById)
      .mockResolvedValueOnce({
        ...baseRecord,
        status: "resolved",
        resolvedAt: new Date("2026-06-14T11:00:00.000Z"),
        resolvedBy: "admin-1",
      })
      .mockResolvedValueOnce({
        ...baseRecord,
        status: "open",
        resolvedAt: null,
        resolvedBy: null,
      });
    vi.mocked(updateFeedbackStatus).mockResolvedValue({
      ...baseRecord,
      status: "open",
      resolvedAt: null,
      resolvedBy: null,
    });

    await updateFeedbackStatusForAdmin({
      feedbackId: "fb-1",
      status: "open",
      adminUserId: "admin-1",
    });

    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "feedback.reopen" }),
    );
  });
});
