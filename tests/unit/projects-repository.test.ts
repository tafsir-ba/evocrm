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
import { findProjects } from "@/server/repositories/projects";

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
    await findProjectById("ws-1", "project-1");

    expect(ProjectModel.findOne).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      _id: "project-1",
    });
  });
});
