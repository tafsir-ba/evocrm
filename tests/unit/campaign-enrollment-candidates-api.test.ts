import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/workspaces/require-workspace-api-access", () => ({
  requireWorkspaceApiAccess: vi.fn(),
}));

vi.mock("@/server/services/campaign-enrollments", () => ({
  listEnrollmentCandidatesForWorkspace: vi.fn(),
}));

import { GET as getEnrollmentCandidates } from "@/app/api/workspaces/[workspaceSlug]/campaigns/[campaignId]/enrollment-candidates/route";
import { listEnrollmentCandidatesForWorkspace } from "@/server/services/campaign-enrollments";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";
import { AppError } from "@/server/errors";

const routeContext = {
  params: Promise.resolve({ workspaceSlug: "demo", campaignId: "camp-1" }),
};

describe("campaign enrollment candidates API route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireWorkspaceApiAccess).mockResolvedValue({
      userId: "user-1",
      workspace: {
        id: "ws-1",
        slug: "demo",
        name: "Demo",
        timezone: "UTC",
        defaultCurrency: "USD",
      },
      membership: {
        id: "m-1",
        userId: "user-1",
        workspaceId: "ws-1",
        roleId: "role-1",
        status: "active",
        permissions: ["campaign:read"],
      },
    });
    vi.mocked(listEnrollmentCandidatesForWorkspace).mockResolvedValue({
      candidates: [
        {
          audienceType: "leads",
          id: "lead-1",
          fullName: "Tafsir Ba",
          email: "tafsir@example.com",
          phone: null,
          emailConsentStatus: "unknown",
          createdAt: new Date("2026-06-15T10:00:00.000Z"),
        },
      ],
      total: 1,
    });
  });

  it("returns 401 when workspace access is unauthenticated", async () => {
    vi.mocked(requireWorkspaceApiAccess).mockRejectedValue(
      new AppError("UNAUTHENTICATED", "Authentication required."),
    );

    const response = await getEnrollmentCandidates(
      new Request("http://localhost/api/workspaces/demo/campaigns/camp-1/enrollment-candidates"),
      routeContext,
    );

    expect(response.status).toBe(401);
  });

  it("returns 403 when campaign:read is missing", async () => {
    vi.mocked(requireWorkspaceApiAccess).mockRejectedValue(
      new AppError("FORBIDDEN", "Permission denied."),
    );

    const response = await getEnrollmentCandidates(
      new Request("http://localhost/api/workspaces/demo/campaigns/camp-1/enrollment-candidates"),
      routeContext,
    );

    expect(response.status).toBe(403);
  });

  it("requires campaign:read", async () => {
    const response = await getEnrollmentCandidates(
      new Request("http://localhost/api/workspaces/demo/campaigns/camp-1/enrollment-candidates"),
      routeContext,
    );

    expect(response.status).toBe(200);
    expect(requireWorkspaceApiAccess).toHaveBeenCalledWith("demo", "campaign:read");
  });

  it("rejects invalid search query length", async () => {
    const response = await getEnrollmentCandidates(
      new Request(
        `http://localhost/api/workspaces/demo/campaigns/camp-1/enrollment-candidates?search=${"a".repeat(121)}`,
      ),
      routeContext,
    );

    expect(response.status).toBe(400);
    expect(listEnrollmentCandidatesForWorkspace).not.toHaveBeenCalled();
  });

  it("returns paginated candidates and calls the service with workspace id", async () => {
    const response = await getEnrollmentCandidates(
      new Request(
        "http://localhost/api/workspaces/demo/campaigns/camp-1/enrollment-candidates?page=2&pageSize=25&search=tafsir",
      ),
      routeContext,
    );

    expect(response.status).toBe(200);
    expect(listEnrollmentCandidatesForWorkspace).toHaveBeenCalledWith("ws-1", "camp-1", {
      page: 2,
      pageSize: 25,
      search: "tafsir",
    });

    const payload = await response.json();
    expect(payload.data).toHaveLength(1);
    expect(payload.pagination).toEqual(
      expect.objectContaining({
        page: 2,
        pageSize: 25,
        total: 1,
      }),
    );
  });
});
