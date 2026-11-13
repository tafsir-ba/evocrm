import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/memberships", () => ({
  findActiveMembershipsForWorkspace: vi.fn(),
}));

vi.mock("@/server/repositories/users", () => ({
  findUsersByIds: vi.fn(),
}));

import { findActiveMembershipsForWorkspace } from "@/server/repositories/memberships";
import { findUsersByIds } from "@/server/repositories/users";
import { listWorkspaceMembersForWorkspace } from "@/server/services/members";

const now = new Date("2026-11-01T00:00:00.000Z");

function membership(userId: string) {
  return {
    id: `membership-${userId}`,
    userId,
    workspaceId: "ws-1",
    roleId: "role-1",
    status: "active" as const,
    createdAt: now,
    updatedAt: now,
  };
}

describe("listWorkspaceMembersForWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns active members from one user lookup and keeps the rest when a user is missing", async () => {
    vi.mocked(findActiveMembershipsForWorkspace).mockResolvedValue([
      membership("user-b"),
      membership("user-missing"),
      membership("user-a"),
    ]);
    vi.mocked(findUsersByIds).mockResolvedValue([
      {
        id: "user-a",
        email: "ada@example.com",
        name: "Ada",
        authProvider: "credentials",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "user-b",
        email: "beau@example.com",
        authProvider: "credentials",
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const members = await listWorkspaceMembersForWorkspace("ws-1");

    expect(findUsersByIds).toHaveBeenCalledTimes(1);
    expect(findUsersByIds).toHaveBeenCalledWith([
      "user-b",
      "user-missing",
      "user-a",
    ]);
    expect(members).toEqual([
      { userId: "user-a", name: "Ada", email: "ada@example.com" },
      { userId: "user-b", name: null, email: "beau@example.com" },
    ]);
  });
});
