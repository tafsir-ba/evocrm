import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/require-auth", () => ({
  requireAuth: vi.fn(),
}));

vi.mock("@/server/workspaces/resolve-workspace", () => ({
  resolveWorkspace: vi.fn(),
}));

vi.mock("@/server/permissions/require-membership", () => ({
  requireMembership: vi.fn(),
}));

vi.mock("@/server/permissions/require-project-access", () => ({
  requireProjectAccess: vi.fn(),
}));

vi.mock("@/server/features/project-sharing", () => ({
  assertProjectSharingEnabled: vi.fn(),
}));

vi.mock("@/server/services/project-grants", () => ({
  listProjectGrantsForProject: vi.fn(),
  changeProjectGrantRole: vi.fn(),
  removeProjectGrant: vi.fn(),
}));

vi.mock("@/server/services/project-invitations", () => ({
  listProjectInvitations: vi.fn(),
  sendProjectInvitation: vi.fn(),
}));

import { POST as postSharing, PATCH as patchSharing } from "@/app/api/workspaces/[workspaceSlug]/projects/[projectId]/sharing/route";
import { requireAuth } from "@/server/auth/require-auth";
import { AppError } from "@/server/errors";
import { requireMembership } from "@/server/permissions/require-membership";
import { requireProjectAccess } from "@/server/permissions/require-project-access";
import { sendProjectInvitation } from "@/server/services/project-invitations";
import { changeProjectGrantRole } from "@/server/services/project-grants";
import { resolveWorkspace } from "@/server/workspaces/resolve-workspace";

describe("project sharing invite route permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "user-1", email: "a@b.com" },
    } as never);
    vi.mocked(resolveWorkspace).mockResolvedValue({
      id: "ws-1",
      slug: "demo",
      name: "Demo",
      timezone: "UTC",
      defaultCurrency: "USD",
    } as never);
    vi.mocked(requireMembership).mockResolvedValue({
      id: "m1",
      userId: "user-1",
      workspaceId: "ws-1",
      roleId: "role-1",
      status: "active",
      permissions: ["project:read"],
    } as never);
  });

  it("allows non-admin with project grant to invite", async () => {
    vi.mocked(requireProjectAccess).mockResolvedValue({
      projectRole: "contributor",
      isWorkspaceAdmin: false,
    } as never);
    vi.mocked(sendProjectInvitation).mockResolvedValue({
      invitation: { id: "inv-1", email: "x@y.com" },
    } as never);

    const response = await postSharing(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "x@y.com",
          projectRole: "viewer",
        }),
      }),
      { params: Promise.resolve({ workspaceSlug: "demo", projectId: "proj-1" }) },
    );

    expect(response.status).toBe(201);
    expect(sendProjectInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        actorProjectRole: "contributor",
        isWorkspaceAdmin: false,
      }),
    );
  });

  it("denies invite when user has no project grant", async () => {
    vi.mocked(requireProjectAccess).mockRejectedValue(
      new AppError("PERMISSION_DENIED", "You do not have access to this project."),
    );

    const response = await postSharing(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "x@y.com",
          projectRole: "viewer",
        }),
      }),
      { params: Promise.resolve({ workspaceSlug: "demo", projectId: "proj-1" }) },
    );

    expect(response.status).toBe(403);
    expect(sendProjectInvitation).not.toHaveBeenCalled();
  });

  it("denies role changes for non-admin collaborators", async () => {
    vi.mocked(requireProjectAccess).mockResolvedValue({
      projectRole: "contributor",
      isWorkspaceAdmin: false,
    } as never);

    const response = await patchSharing(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: "user-2",
          projectRole: "viewer",
        }),
      }),
      { params: Promise.resolve({ workspaceSlug: "demo", projectId: "proj-1" }) },
    );

    expect(response.status).toBe(403);
    expect(changeProjectGrantRole).not.toHaveBeenCalled();
  });
});
