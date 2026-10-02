import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/workspaces/require-workspace-api-access", () => ({
  requireWorkspaceApiAccess: vi.fn(),
}));

vi.mock("@/server/services/imports", () => ({
  getImportConfigForEntity: vi.fn(),
  createImportJobForWorkspace: vi.fn(),
}));

import { GET as getImportConfig } from "@/app/api/workspaces/[workspaceSlug]/imports/config/route";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";
import { getImportConfigForEntity } from "@/server/services/imports";
import { AppError } from "@/server/errors";

describe("import API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns import config for lead:create member", async () => {
    vi.mocked(requireWorkspaceApiAccess).mockResolvedValue({
      userId: "user-1",
      workspace: {
        id: "workspace-1",
        slug: "demo",
        name: "Demo",
        timezone: "UTC",
        defaultCurrency: "EUR",
      },
      membership: {
        id: "m1",
        userId: "user-1",
        workspaceId: "workspace-1",
        roleId: "role-1",
        status: "active",
        permissions: ["lead:create"],
      },
      permissions: ["lead:create"],
      accessMode: "member" as const,
      isWorkspaceAdmin: false,
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
    expect(requireWorkspaceApiAccess).toHaveBeenCalledWith("demo", "lead:create");
  });

  it("returns validation error for invalid entity type", async () => {
    const response = await getImportConfig(
      new Request("http://localhost/api/workspaces/demo/imports/config?entityType=invalid"),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(400);
  });

  it("returns UNAUTHENTICATED when not logged in", async () => {
    vi.mocked(requireWorkspaceApiAccess).mockRejectedValue(
      new AppError("UNAUTHENTICATED", "Authentication required."),
    );

    const response = await getImportConfig(
      new Request("http://localhost/api/workspaces/demo/imports/config?entityType=lead"),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(401);
  });
});
