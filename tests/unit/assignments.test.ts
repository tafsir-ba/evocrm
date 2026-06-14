import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/memberships", () => ({
  findMembership: vi.fn(),
}));

import { findMembership } from "@/server/repositories/memberships";
import {
  validateAssignableMember,
  validateOptionalAssignableMember,
} from "@/server/services/assignments";

describe("assignments service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts active membership", async () => {
    vi.mocked(findMembership).mockResolvedValue({
      id: "m1",
      userId: "user-1",
      workspaceId: "ws-1",
      roleId: "role-1",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      validateAssignableMember("ws-1", "user-1", "Assignee"),
    ).resolves.toBeUndefined();
  });

  it.each(["suspended", "removed", "invited"] as const)(
    "rejects %s membership",
    async (status) => {
      vi.mocked(findMembership).mockResolvedValue({
        id: "m1",
        userId: "user-1",
        workspaceId: "ws-1",
        roleId: "role-1",
        status,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(
        validateAssignableMember("ws-1", "user-1"),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    },
  );

  it("skips validation for null assignee", async () => {
    await expect(
      validateOptionalAssignableMember("ws-1", null, "Assignee"),
    ).resolves.toBeUndefined();
    expect(findMembership).not.toHaveBeenCalled();
  });
});
