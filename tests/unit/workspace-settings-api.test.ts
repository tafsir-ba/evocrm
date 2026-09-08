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

vi.mock("@/server/services/workspace-settings", () => ({
  getWorkspaceSettings: vi.fn(),
  updateWorkspaceSettings: vi.fn(),
}));

import { GET as getSettings, PATCH as patchSettings } from "@/app/api/workspaces/[workspaceSlug]/settings/route";
import { requireAuth } from "@/server/auth/require-auth";
import { requireWorkspaceMemberApiAccess } from "@/server/workspaces/require-workspace-api-access";
import {
  getWorkspaceSettings,
  updateWorkspaceSettings,
} from "@/server/services/workspace-settings";
import { resolveWorkspace } from "@/server/workspaces/resolve-workspace";
import { AppError } from "@/server/errors";

describe("workspace settings API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns settings for settings:read", async () => {
    vi.mocked(requireAuth).mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
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
    vi.mocked(getWorkspaceSettings).mockResolvedValue({
      id: "ws-1",
      name: "Demo",
      slug: "demo",
      type: "agency",
      timezone: "UTC",
      defaultCurrency: "USD",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const response = await getSettings(
      new Request("http://localhost/api/workspaces/demo/settings"),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(200);
    expect(requireWorkspaceMemberApiAccess).toHaveBeenCalledWith("demo", "settings:read");
  });

  it("updates settings for settings:update", async () => {
    vi.mocked(requireAuth).mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
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
        permissions: ["settings:update"],
      },
      permissions: ["settings:update"],
      accessMode: "member" as const,
      isWorkspaceAdmin: false,
    });
    vi.mocked(updateWorkspaceSettings).mockResolvedValue({
      id: "ws-1",
      name: "Demo Updated",
      slug: "demo",
      type: "agency",
      timezone: "Europe/Paris",
      defaultCurrency: "EUR",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-06-14T00:00:00.000Z",
    });

    const response = await patchSettings(
      new Request("http://localhost/api/workspaces/demo/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Demo Updated", defaultCurrency: "EUR" }),
      }),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(200);
    expect(requireWorkspaceMemberApiAccess).toHaveBeenCalledWith("demo", "settings:update");
  });

  it("denies update without settings:update", async () => {
    vi.mocked(requireAuth).mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
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

    const response = await patchSettings(
      new Request("http://localhost/api/workspaces/demo/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Hacked" }),
      }),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(403);
  });
});
