import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/permissions/require-project-access", () => ({
  resolveAllowedProjectIds: vi.fn(),
}));

vi.mock("@/server/repositories/projects", () => ({
  findProjectById: vi.fn(),
}));

import { resolveAllowedProjectIds } from "@/server/permissions/require-project-access";
import { findProjectById } from "@/server/repositories/projects";
import { applyUserProjectScope } from "@/server/services/apply-project-scope";
import { resolveProjectScopeForUser } from "@/server/services/project-scope";

describe("project scope filtering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findProjectById).mockResolvedValue({
      id: "proj-1",
      workspaceId: "ws-1",
      archivedAt: null,
    } as never);
  });

  it("allows workspace admins full access (null allowlist)", async () => {
    vi.mocked(resolveAllowedProjectIds).mockResolvedValue(null);

    await expect(
      resolveProjectScopeForUser("ws-1", "admin-1", undefined),
    ).resolves.toEqual({
      projectId: undefined,
      allowedProjectIds: null,
    });
  });

  it("denies requested project outside grants", async () => {
    vi.mocked(resolveAllowedProjectIds).mockResolvedValue(["proj-1"]);

    await expect(
      resolveProjectScopeForUser("ws-1", "user-1", "proj-2"),
    ).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
    });
  });

  it("applies grant allowlist when no project filter is requested", async () => {
    vi.mocked(resolveAllowedProjectIds).mockResolvedValue(["proj-1", "proj-2"]);

    await expect(
      applyUserProjectScope("ws-1", "user-1", { search: "x" }),
    ).resolves.toEqual({
      search: "x",
      projectId: undefined,
      projectIds: ["proj-1", "proj-2"],
    });
  });
});
