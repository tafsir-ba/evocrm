import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/require-auth", () => ({
  requireAuth: vi.fn(),
}));

vi.mock("@/server/workspaces/require-workspace-api-access", () => ({
  requireWorkspaceApiAccess: vi.fn(),
}));

vi.mock("@/server/services/workspace-deletion", () => ({
  deleteWorkspaceForOwner: vi.fn(),
}));

import { AppError } from "@/server/errors";
import { DELETE } from "@/app/api/workspaces/[workspaceSlug]/route";
import { deleteWorkspaceForOwner } from "@/server/services/workspace-deletion";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

describe("DELETE /api/workspaces/[workspaceSlug]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes workspace when owner confirms name", async () => {
    vi.mocked(requireWorkspaceApiAccess).mockResolvedValue({
      userId: "user-1",
      workspace: {
        id: "ws-1",
        slug: "evo-crm",
        name: "Evo CRM",
        timezone: "UTC",
        defaultCurrency: "USD",
      },
      membership: {
        id: "m-1",
        workspaceId: "ws-1",
        userId: "user-1",
        roleId: "role-owner",
        status: "active",
        permissions: [],
      },
    });

    vi.mocked(deleteWorkspaceForOwner).mockResolvedValue({ slug: "evo-crm" });

    const response = await DELETE(
      new Request("http://localhost/api/workspaces/evo-crm", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmName: "Evo CRM" }),
      }),
      { params: Promise.resolve({ workspaceSlug: "evo-crm" }) },
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data.deleted).toBe(true);
    expect(deleteWorkspaceForOwner).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      actorUserId: "user-1",
      confirmation: { confirmName: "Evo CRM" },
    });
  });

  it("returns forbidden when service rejects non-owner", async () => {
    vi.mocked(requireWorkspaceApiAccess).mockResolvedValue({
      userId: "user-2",
      workspace: {
        id: "ws-1",
        slug: "evo-crm",
        name: "Evo CRM",
        timezone: "UTC",
        defaultCurrency: "USD",
      },
      membership: {
        id: "m-2",
        workspaceId: "ws-1",
        userId: "user-2",
        roleId: "role-agent",
        status: "active",
        permissions: [],
      },
    });

    vi.mocked(deleteWorkspaceForOwner).mockRejectedValue(
      new AppError("FORBIDDEN", "Only the workspace owner can perform this action."),
    );

    const response = await DELETE(
      new Request("http://localhost/api/workspaces/evo-crm", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmName: "Evo CRM" }),
      }),
      { params: Promise.resolve({ workspaceSlug: "evo-crm" }) },
    );

    expect(response.status).toBe(403);
  });
});
