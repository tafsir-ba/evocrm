import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/require-auth", () => ({
  requireAuth: vi.fn(),
}));

vi.mock("@/server/workspaces/resolve-workspace", () => ({
  resolveWorkspace: vi.fn(),
}));

vi.mock("@/server/workspaces/require-workspace-api-access", () => ({
  requireWorkspaceMemberApiAccess: vi.fn(),
}));

vi.mock("@/server/services/members", () => ({
  listWorkspaceMembersForWorkspace: vi.fn(),
}));

import { GET as getMembers } from "@/app/api/workspaces/[workspaceSlug]/members/route";
import { requireAuth } from "@/server/auth/require-auth";
import { requireWorkspaceMemberApiAccess } from "@/server/workspaces/require-workspace-api-access";
import { listWorkspaceMembersForWorkspace } from "@/server/services/members";
import { resolveWorkspace } from "@/server/workspaces/resolve-workspace";
import { AppError } from "@/server/errors";

describe("members API route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns active workspace members for settings:read", async () => {
    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "user-1", email: "a@b.com" },
    });
    vi.mocked(resolveWorkspace).mockResolvedValue({
      id: "ws-1",
      slug: "demo",
      name: "Demo",
      timezone: "UTC",
      defaultCurrency: "USD",
    });
    vi.mocked(requireWorkspaceMemberApiAccess).mockResolvedValue({
      userId: "user-1",
      workspace: {
        id: "ws-1",
        slug: "demo",
        name: "Demo",
        timezone: "UTC",
        defaultCurrency: "USD",
      },
      membership: {
        id: "m1",
        userId: "user-1",
        workspaceId: "ws-1",
        roleId: "role-1",
        status: "active",
        permissions: ["settings:read"],
      },
      permissions: ["settings:read"],
      accessMode: "member" as const,
      isWorkspaceAdmin: false,
    });
    vi.mocked(listWorkspaceMembersForWorkspace).mockResolvedValue([
      {
        userId: "user-1",
        name: "Jane Agent",
        email: "jane@example.com",
      },
    ]);

    const response = await getMembers(
      new Request("http://localhost/api/workspaces/demo/members"),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(200);
    expect(requireWorkspaceMemberApiAccess).toHaveBeenCalledWith("demo", "settings:read");
    const body = await response.json();
    expect(body.data.members).toHaveLength(1);
    expect(body.data.members[0].userId).toBe("user-1");
  });

  it("returns PERMISSION_DENIED without settings:read", async () => {
    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "user-1", email: "a@b.com" },
    });
    vi.mocked(resolveWorkspace).mockResolvedValue({
      id: "ws-1",
      slug: "demo",
      name: "Demo",
      timezone: "UTC",
      defaultCurrency: "USD",
    });
    vi.mocked(requireWorkspaceMemberApiAccess).mockRejectedValue(
      new AppError("PERMISSION_DENIED", "Permission denied."),
    );

    const response = await getMembers(
      new Request("http://localhost/api/workspaces/demo/members"),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(403);
  });
});
