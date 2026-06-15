import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/mongoose", () => ({
  connectDb: vi.fn(),
}));

vi.mock("@/models/project", () => ({
  ProjectModel: {
    find: vi.fn(),
    findOne: vi.fn(),
  },
}));

import { ProjectModel } from "@/models/project";
import { findProjectById, findProjects } from "@/server/repositories/projects";
import { TEST_PROJECT_ID } from "@/tests/helpers/crm-fixtures";

describe("projects repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("excludes archived projects by default", async () => {
    const lean = vi.fn().mockResolvedValue([]);
    const sort = vi.fn().mockReturnValue({ lean });
    vi.mocked(ProjectModel.find).mockReturnValue({ sort } as never);

    await findProjects("ws-1");

    expect(ProjectModel.find).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      archivedAt: null,
    });
  });

  it("includes archived projects when includeArchived is true", async () => {
    const lean = vi.fn().mockResolvedValue([]);
    const sort = vi.fn().mockReturnValue({ lean });
    vi.mocked(ProjectModel.find).mockReturnValue({ sort } as never);

    await findProjects("ws-1", { includeArchived: true });

    expect(ProjectModel.find).toHaveBeenCalledWith({
      workspaceId: "ws-1",
    });
    expect(ProjectModel.find).not.toHaveBeenCalledWith(
      expect.objectContaining({ archivedAt: null }),
    );
  });

  it("scopes lookup by workspaceId and projectId", async () => {
    const lean = vi.fn().mockResolvedValue(null);
    vi.mocked(ProjectModel.findOne).mockReturnValue({ lean } as never);

    const { findProjectById } = await import("@/server/repositories/projects");
    await findProjectById("ws-1", TEST_PROJECT_ID);

    expect(ProjectModel.findOne).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      _id: TEST_PROJECT_ID,
    });
  });

  it("returns null for invalid project ids without querying", async () => {
    const result = await findProjectById("ws-1", "project-1");

    expect(result).toBeNull();
    expect(ProjectModel.findOne).not.toHaveBeenCalled();
  });
});
