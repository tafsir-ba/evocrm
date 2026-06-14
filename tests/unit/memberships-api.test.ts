import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/require-auth", () => ({
  requireAuth: vi.fn(),
}));

vi.mock("@/server/workspaces/resolve-workspace", () => ({
  resolveWorkspace: vi.fn(),
}));

vi.mock("@/server/permissions/require-permission", () => ({
  requirePermission: vi.fn(),
}));

vi.mock("@/server/services/memberships", () => ({
  listMembershipsForWorkspace: vi.fn(),
  addMembershipToWorkspace: vi.fn(),
}));

import {
  GET as getMemberships,
  POST as postMembership,
} from "@/app/api/workspaces/[workspaceSlug]/memberships/route";
import { PATCH as patchMembership } from "@/app/api/workspaces/[workspaceSlug]/memberships/[membershipId]/route";
import { requireAuth } from "@/server/auth/require-auth";
import { requirePermission } from "@/server/permissions/require-permission";
import { listMembershipsForWorkspace } from "@/server/services/memberships";
import { resolveWorkspace } from "@/server/workspaces/resolve-workspace";
import { AppError } from "@/server/errors";

describe("memberships API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists memberships with settings:read", async () => {
    vi.mocked(requireAuth).mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    vi.mocked(resolveWorkspace).mockResolvedValue({
      id: "ws-1",
      slug: "demo",
      name: "Demo",
      timezone: "UTC",
      defaultCurrency: "USD",
    });
    vi.mocked(requirePermission).mockResolvedValue({
      membership: {
        id: "m1",
        userId: "user-1",
        workspaceId: "ws-1",
        roleId: "role-1",
        status: "active",
        permissions: ["settings:read", "users:manage"],
      },
    });
    vi.mocked(listMembershipsForWorkspace).mockResolvedValue([
      {
        id: "m1",
        userId: "user-1",
        name: "Jane",
        email: "jane@example.com",
        image: null,
        roleId: "role-1",
        roleName: "Owner",
        roleKey: "owner",
        isOwnerRole: true,
        status: "active",
        joinedAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    const response = await getMemberships(
      new Request("http://localhost/api/workspaces/demo/memberships"),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.memberships).toHaveLength(1);
    expect(body.data.canManage).toBe(true);
  });

  it("requires users:manage for POST", async () => {
    vi.mocked(requireAuth).mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    vi.mocked(resolveWorkspace).mockResolvedValue({
      id: "ws-1",
      slug: "demo",
      name: "Demo",
      timezone: "UTC",
      defaultCurrency: "USD",
    });
    vi.mocked(requirePermission).mockRejectedValue(
      new AppError("PERMISSION_DENIED", "Permission denied."),
    );

    const response = await postMembership(
      new Request("http://localhost/api/workspaces/demo/memberships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "new@example.com",
          roleId: "507f1f77bcf86cd799439011",
        }),
      }),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(403);
    expect(requirePermission).toHaveBeenCalledWith("ws-1", "user-1", "users:manage");
  });

  it("requires users:manage for PATCH", async () => {
    vi.mocked(requireAuth).mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    vi.mocked(resolveWorkspace).mockResolvedValue({
      id: "ws-1",
      slug: "demo",
      name: "Demo",
      timezone: "UTC",
      defaultCurrency: "USD",
    });
    vi.mocked(requirePermission).mockRejectedValue(
      new AppError("PERMISSION_DENIED", "Permission denied."),
    );

    const response = await patchMembership(
      new Request("http://localhost/api/workspaces/demo/memberships/m1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "suspended" }),
      }),
      { params: Promise.resolve({ workspaceSlug: "demo", membershipId: "m1" }) },
    );

    expect(response.status).toBe(403);
  });
});
