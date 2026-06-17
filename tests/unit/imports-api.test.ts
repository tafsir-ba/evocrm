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

vi.mock("@/server/services/imports", () => ({
  getImportConfigForEntity: vi.fn(),
  createImportJobForWorkspace: vi.fn(),
}));

import { GET as getImportConfig } from "@/app/api/workspaces/[workspaceSlug]/imports/config/route";
import { requireAuth } from "@/server/auth/require-auth";
import { requirePermission } from "@/server/permissions/require-permission";
import { getImportConfigForEntity } from "@/server/services/imports";
import { resolveWorkspace } from "@/server/workspaces/resolve-workspace";
import { AppError } from "@/server/errors";

describe("import API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns import config for lead:create member", async () => {
    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "user-1", email: "a@b.com" },
    });
    vi.mocked(resolveWorkspace).mockResolvedValue({
      id: "workspace-1",
      slug: "demo",
      name: "Demo",
      timezone: "UTC",
      defaultCurrency: "EUR",
    } as never);
    vi.mocked(requirePermission).mockResolvedValue({
      membership: {
        id: "m1",
        userId: "user-1",
        workspaceId: "workspace-1",
        roleId: "role-1",
        status: "active",
        permissions: ["lead:create"],
      },
    } as never);
    vi.mocked(getImportConfigForEntity).mockReturnValue({
      entityType: "lead",
      label: "Lead",
      fields: [],
    });

    const response = await getImportConfig(
      new Request("http://localhost/api/workspaces/demo/imports/config?entityType=lead"),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data.entityType).toBe("lead");
    expect(requirePermission).toHaveBeenCalledWith(
      "workspace-1",
      "user-1",
      "lead:create",
    );
  });

  it("returns validation error for invalid entity type", async () => {
    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "user-1", email: "a@b.com" },
    });
    vi.mocked(resolveWorkspace).mockResolvedValue({
      id: "workspace-1",
      slug: "demo",
      name: "Demo",
      timezone: "UTC",
      defaultCurrency: "EUR",
    } as never);

    const response = await getImportConfig(
      new Request("http://localhost/api/workspaces/demo/imports/config?entityType=invalid"),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(400);
  });

  it("returns UNAUTHENTICATED when not logged in", async () => {
    vi.mocked(requireAuth).mockRejectedValue(
      new AppError("UNAUTHENTICATED", "Authentication required."),
    );

    const response = await getImportConfig(
      new Request("http://localhost/api/workspaces/demo/imports/config?entityType=lead"),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(401);
  });
});
