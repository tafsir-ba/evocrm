import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/project-sharing-feature", () => ({
  PROJECT_SHARING_ENABLED: true,
}));

vi.mock("@/server/permissions/require-project-access", () => ({
  resolveAllowedProjectIds: vi.fn(),
  requireProjectAccess: vi.fn(),
}));

vi.mock("@/server/repositories/projects", () => ({
  findProjectById: vi.fn(),
}));

import { AppError } from "@/server/errors";
import {
  requireProjectAccess,
  resolveAllowedProjectIds,
} from "@/server/permissions/require-project-access";
import { findProjectById } from "@/server/repositories/projects";
import {
  applyUserProjectScope,
  assertMultiProjectRecordAccess,
  assertRecordProjectAccess,
} from "@/server/services/apply-project-scope";
import { resolveProjectScopeForUser } from "@/server/services/project-scope";

describe("resolveProjectScopeForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps full access for workspace admins", async () => {
    vi.mocked(resolveAllowedProjectIds).mockResolvedValue(null);
    vi.mocked(findProjectById).mockResolvedValue({ id: "proj-1" } as never);

    await expect(
      resolveProjectScopeForUser("ws-1", "user-1", "proj-1"),
    ).resolves.toEqual({
      projectId: "proj-1",
      allowedProjectIds: null,
    });
  });

  it("narrows scoped users to their grants", async () => {
    vi.mocked(resolveAllowedProjectIds).mockResolvedValue(["proj-1", "proj-2"]);

    await expect(resolveProjectScopeForUser("ws-1", "user-1")).resolves.toEqual({
      projectId: undefined,
      allowedProjectIds: ["proj-1", "proj-2"],
    });
  });

  it("rejects requested projects outside the allowlist", async () => {
    vi.mocked(resolveAllowedProjectIds).mockResolvedValue(["proj-1"]);

    await expect(
      resolveProjectScopeForUser("ws-1", "user-1", "proj-2"),
    ).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
      message: "You do not have access to this project.",
    } satisfies Partial<AppError>);
  });
});

describe("applyUserProjectScope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applies an explicit allowed projectId", async () => {
    vi.mocked(resolveAllowedProjectIds).mockResolvedValue(["proj-1", "proj-2"]);

    await expect(
      applyUserProjectScope("ws-1", "user-1", {
        projectId: "proj-1",
        search: "villa",
      }),
    ).resolves.toEqual({
      projectId: "proj-1",
      search: "villa",
      projectIds: undefined,
    });
  });

  it("injects projectIds when no explicit filter is requested", async () => {
    vi.mocked(resolveAllowedProjectIds).mockResolvedValue(["proj-1", "proj-2"]);

    await expect(
      applyUserProjectScope("ws-1", "user-1", { search: "villa" }),
    ).resolves.toEqual({
      search: "villa",
      projectId: undefined,
      projectIds: ["proj-1", "proj-2"],
    });
  });

  it("leaves admin filters unchanged when no projectId is set", async () => {
    vi.mocked(resolveAllowedProjectIds).mockResolvedValue(null);

    await expect(
      applyUserProjectScope("ws-1", "user-1", { search: "villa" }),
    ).resolves.toEqual({ search: "villa" });
  });

  it("leaves ordinary member filters unchanged when resolveAllowedProjectIds is null", async () => {
    vi.mocked(resolveAllowedProjectIds).mockResolvedValue(null);

    await expect(
      applyUserProjectScope("ws-1", "agent-1", {
        search: "duplex",
        projectId: undefined,
      }),
    ).resolves.toEqual({
      search: "duplex",
      projectId: undefined,
    });
  });
});

describe("assertRecordProjectAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires project access when the record is project-scoped", async () => {
    vi.mocked(requireProjectAccess).mockResolvedValue({} as never);

    await assertRecordProjectAccess("ws-1", "user-1", "proj-1", "lead:read");

    expect(requireProjectAccess).toHaveBeenCalledWith(
      "ws-1",
      "user-1",
      "proj-1",
      "lead:read",
    );
  });

  it("denies project-scoped callers when the record has no projectId", async () => {
    vi.mocked(resolveAllowedProjectIds).mockResolvedValue(["proj-1"]);

    await expect(
      assertRecordProjectAccess("ws-1", "user-1", null, "lead:read"),
    ).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
    });
    expect(requireProjectAccess).not.toHaveBeenCalled();
  });

  it("allows admins when the record has no projectId", async () => {
    vi.mocked(resolveAllowedProjectIds).mockResolvedValue(null);

    await assertRecordProjectAccess("ws-1", "admin-1", null, "lead:read");
    expect(requireProjectAccess).not.toHaveBeenCalled();
  });
});

describe("assertMultiProjectRecordAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("denies workspace-wide campaigns for grant-scoped callers", async () => {
    vi.mocked(resolveAllowedProjectIds).mockResolvedValue(["proj-1"]);

    await expect(
      assertMultiProjectRecordAccess("ws-1", "user-1", [], "campaign:read"),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("denies campaigns outside granted projects", async () => {
    vi.mocked(resolveAllowedProjectIds).mockResolvedValue(["proj-1"]);

    await expect(
      assertMultiProjectRecordAccess(
        "ws-1",
        "user-1",
        ["proj-other"],
        "campaign:read",
      ),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("allows campaigns that intersect granted projects", async () => {
    vi.mocked(resolveAllowedProjectIds).mockResolvedValue(["proj-1", "proj-2"]);
    vi.mocked(requireProjectAccess).mockResolvedValue({} as never);

    await assertMultiProjectRecordAccess(
      "ws-1",
      "user-1",
      ["proj-2", "proj-9"],
      "campaign:read",
    );

    expect(requireProjectAccess).toHaveBeenCalledWith(
      "ws-1",
      "user-1",
      "proj-2",
      "campaign:read",
    );
  });
});
