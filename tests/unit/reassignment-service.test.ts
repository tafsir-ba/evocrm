import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/reassignment", () => ({
  countAssignedRecords: vi.fn(),
  hasAssignedRecords: vi.fn(),
  reassignAssignedRecords: vi.fn(),
}));

vi.mock("@/server/repositories/memberships", () => ({
  findMembershipByIdInWorkspace: vi.fn(),
  updateMembership: vi.fn(),
}));

vi.mock("@/server/services/assignments", () => ({
  validateAssignableMember: vi.fn(),
}));

vi.mock("@/server/permissions/owner-protection", () => ({
  assertOwnerProtection: vi.fn(),
}));

vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: vi.fn(),
}));

import { countAssignedRecords, hasAssignedRecords } from "@/server/repositories/reassignment";
import { findMembershipByIdInWorkspace } from "@/server/repositories/memberships";
import { getReassignmentSummary } from "@/server/services/reassignment";

describe("reassignment service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns counts for active assigned records", async () => {
    vi.mocked(findMembershipByIdInWorkspace).mockResolvedValue({
      id: "m1",
      userId: "user-1",
      workspaceId: "ws-1",
      roleId: "role-1",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(countAssignedRecords).mockResolvedValue({
      leads: 2,
      properties: 1,
      opportunities: 3,
      activities: 4,
      projects: 0,
    });
    vi.mocked(hasAssignedRecords).mockReturnValue(true);

    const summary = await getReassignmentSummary({
      workspaceId: "ws-1",
      membershipId: "m1",
    });

    expect(summary.counts.leads).toBe(2);
    expect(summary.requiresReassignment).toBe(true);
    expect(countAssignedRecords).toHaveBeenCalledWith("ws-1", "user-1");
  });
});
