import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/require-auth", () => ({
  requireAuth: vi.fn(),
}));

vi.mock("@/server/auth/require-platform-admin", () => ({
  requirePlatformAdmin: vi.fn(),
}));

vi.mock("@/server/services/feedback", () => ({
  submitFeedbackForUser: vi.fn(),
  listFeedbackForAdmin: vi.fn(),
  updateFeedbackStatusForAdmin: vi.fn(),
  deleteFeedbackForAdmin: vi.fn(),
}));

vi.mock("@/server/security/feedback-rate-limit", () => ({
  assertFeedbackRateLimitPreflight: vi.fn(),
}));

import { POST as submitFeedback } from "@/app/api/feedback/route";
import {
  DELETE as deleteFeedback,
  PATCH as patchFeedback,
} from "@/app/api/admin/feedback/[feedbackId]/route";
import { GET as listFeedback } from "@/app/api/admin/feedback/route";
import { requireAuth } from "@/server/auth/require-auth";
import { requirePlatformAdmin } from "@/server/auth/require-platform-admin";
import { MAX_FEEDBACK_REQUEST_BYTES } from "@/server/feedback/constants";
import { assertFeedbackRateLimitPreflight } from "@/server/security/feedback-rate-limit";
import {
  deleteFeedbackForAdmin,
  listFeedbackForAdmin,
  submitFeedbackForUser,
  updateFeedbackStatusForAdmin,
} from "@/server/services/feedback";
import { AppError } from "@/server/errors";

describe("feedback API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "user-1", email: "reporter@example.com", name: "Reporter" },
    });
    vi.mocked(requirePlatformAdmin).mockResolvedValue({
      user: { id: "admin-1", email: "admin@example.com", name: "Admin" },
    });
  });

  it("submits multipart feedback for authenticated users", async () => {
    vi.mocked(submitFeedbackForUser).mockResolvedValue({ id: "fb-1" });

    const formData = new FormData();
    formData.set("category", "bug");
    formData.set("body", "Button broken");
    formData.set("workspace_slug", "demo");
    formData.set("page_url", "https://app.example/w/demo/leads");
    formData.set("user_agent", "Mozilla/5.0");

    const response = await submitFeedback({
      headers: {
        get: (name: string) =>
          name.toLowerCase() === "content-length" ? "1024" : null,
      },
      formData: async () => formData,
    } as unknown as Request);

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data).toEqual({ ok: true, id: "fb-1" });
    expect(assertFeedbackRateLimitPreflight).toHaveBeenCalledWith("user-1");
  });

  it("rejects oversized uploads before multipart parsing", async () => {
    const formDataSpy = vi.fn();

    const response = await submitFeedback({
      headers: {
        get: (name: string) =>
          name.toLowerCase() === "content-length"
            ? String(MAX_FEEDBACK_REQUEST_BYTES + 1)
            : null,
      },
      formData: formDataSpy,
    } as unknown as Request);

    expect(response.status).toBe(400);
    expect(formDataSpy).not.toHaveBeenCalled();
    expect(submitFeedbackForUser).not.toHaveBeenCalled();
  });

  it("rejects rate-limited users before multipart parsing", async () => {
    vi.mocked(assertFeedbackRateLimitPreflight).mockImplementation(() => {
      throw new AppError("RATE_LIMITED", "Too many submissions — try again later.");
    });
    const formDataSpy = vi.fn();

    const response = await submitFeedback({
      headers: {
        get: (name: string) =>
          name.toLowerCase() === "content-length" ? "1024" : null,
      },
      formData: formDataSpy,
    } as unknown as Request);

    expect(response.status).toBe(429);
    expect(formDataSpy).not.toHaveBeenCalled();
    expect(submitFeedbackForUser).not.toHaveBeenCalled();
  });

  it("lists feedback for platform admins", async () => {
    vi.mocked(listFeedbackForAdmin).mockResolvedValue({
      items: [],
      total: 0,
      summary: {
        open: 0,
        resolved: 0,
        total: 0,
        byCategory: { bug: 0, idea: 0, other: 0 },
      },
    });

    const response = await listFeedback(
      new Request("http://localhost/api/admin/feedback?status=open"),
    );

    expect(response.status).toBe(200);
    expect(requirePlatformAdmin).toHaveBeenCalled();
  });

  it("returns 403 for non-admin feedback list", async () => {
    vi.mocked(requirePlatformAdmin).mockRejectedValue(
      new AppError("FORBIDDEN", "Platform admin access required."),
    );

    const response = await listFeedback(
      new Request("http://localhost/api/admin/feedback"),
    );

    expect(response.status).toBe(403);
  });

  it("patches feedback status for platform admins", async () => {
    vi.mocked(updateFeedbackStatusForAdmin).mockResolvedValue({
      id: "fb-1",
      category: "bug",
      body: "Broken",
      status: "resolved",
      userEmail: "reporter@example.com",
      userName: null,
      workspaceId: "ws-1",
      workspaceName: "Demo",
      projectId: null,
      pageUrl: null,
      userAgent: null,
      screenshotCount: 0,
      screenshots: [],
      createdAt: new Date().toISOString(),
      resolvedAt: new Date().toISOString(),
      resolvedByEmail: "admin@example.com",
      resolvedBy: "admin-1",
      resolutionNotifiedAt: new Date().toISOString(),
      resolutionNotifiedEmail: "reporter@example.com",
      resolutionNotificationStatus: "sent",
      resolutionNotificationError: null,
    });

    const response = await patchFeedback(
      new Request("http://localhost/api/admin/feedback/fb-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "resolved" }),
      }),
      { params: Promise.resolve({ feedbackId: "fb-1" }) },
    );

    expect(response.status).toBe(200);
  });

  it("deletes feedback for platform admins", async () => {
    vi.mocked(deleteFeedbackForAdmin).mockResolvedValue(true);

    const response = await deleteFeedback(
      new Request("http://localhost/api/admin/feedback/fb-1", { method: "DELETE" }),
      { params: Promise.resolve({ feedbackId: "fb-1" }) },
    );

    expect(response.status).toBe(200);
  });
});
