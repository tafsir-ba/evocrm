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

vi.mock("@/server/services/workspace-export", () => ({
  exportWorkspaceData: vi.fn(),
}));

import { GET as getExport } from "@/app/api/workspaces/[workspaceSlug]/export/route";
import { requireAuth } from "@/server/auth/require-auth";
import { requirePermission } from "@/server/permissions/require-permission";
import { exportWorkspaceData } from "@/server/services/workspace-export";
import { resolveWorkspace } from "@/server/workspaces/resolve-workspace";
import { AppError } from "@/server/errors";

const emptyExportBundle = {
  exportedAt: "2026-06-14T12:00:00.000Z",
  workspaceId: "ws-1",
  workspace: null,
  roles: [],
  memberships: [],
  dictionaries: [],
  dictionaryItems: [],
  tags: [],
  projects: [],
  leads: [],
  properties: [],
  opportunities: [],
  activities: [],
  documents: [],
  campaigns: [],
  campaignSteps: [],
  campaignEnrollments: [],
  campaignSends: [],
  integrations: [],
  integrationLogs: [],
};

describe("workspace export API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    vi.mocked(resolveWorkspace).mockResolvedValue({
      id: "ws-1",
      slug: "demo",
      name: "Demo",
      timezone: "UTC",
      defaultCurrency: "USD",
    });
  });

  it("allows export with settings:update", async () => {
    vi.mocked(requirePermission).mockResolvedValue({
      membership: {
        id: "m1",
        userId: "user-1",
        workspaceId: "ws-1",
        roleId: "role-1",
        status: "active",
        permissions: ["settings:update"],
      },
    });
    vi.mocked(exportWorkspaceData).mockResolvedValue(emptyExportBundle);

    const response = await getExport(
      new Request("http://localhost/api/workspaces/demo/export"),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(200);
    expect(requirePermission).toHaveBeenCalledWith("ws-1", "user-1", "settings:update");
    expect(exportWorkspaceData).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      actorId: "user-1",
    });
  });

  it("denies export with settings:read only", async () => {
    vi.mocked(requirePermission).mockRejectedValue(
      new AppError("PERMISSION_DENIED", "Permission denied."),
    );

    const response = await getExport(
      new Request("http://localhost/api/workspaces/demo/export"),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("PERMISSION_DENIED");
    expect(exportWorkspaceData).not.toHaveBeenCalled();
  });

  it("denies export without settings permissions", async () => {
    vi.mocked(requirePermission).mockRejectedValue(
      new AppError("PERMISSION_DENIED", "Permission denied."),
    );

    const response = await getExport(
      new Request("http://localhost/api/workspaces/demo/export"),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("PERMISSION_DENIED");
    expect(exportWorkspaceData).not.toHaveBeenCalled();
  });
});
