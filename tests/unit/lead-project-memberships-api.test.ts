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

vi.mock("@/server/services/lead-project-memberships", () => ({
  listLeadProjectMemberships: vi.fn(),
  addLeadProjectMembership: vi.fn(),
  removeLeadProjectMembership: vi.fn(),
  setLeadProjectMembershipPrimary: vi.fn(),
  reorderLeadProjectMemberships: vi.fn(),
}));

import {
  GET as getMemberships,
  POST as postMembership,
} from "@/app/api/workspaces/[workspaceSlug]/leads/[leadId]/project-memberships/route";
import { POST as reorderMemberships } from "@/app/api/workspaces/[workspaceSlug]/leads/[leadId]/project-memberships/reorder/route";
import {
  DELETE as deleteMembership,
  PATCH as patchMembership,
} from "@/app/api/workspaces/[workspaceSlug]/leads/[leadId]/project-memberships/[membershipId]/route";
import { requireAuth } from "@/server/auth/require-auth";
import { AppError } from "@/server/errors";
import { requirePermission } from "@/server/permissions/require-permission";
import {
  addLeadProjectMembership,
  listLeadProjectMemberships,
  removeLeadProjectMembership,
  reorderLeadProjectMemberships,
  setLeadProjectMembershipPrimary,
} from "@/server/services/lead-project-memberships";
import { resolveWorkspace } from "@/server/workspaces/resolve-workspace";

const membership = {
  id: "507f1f77bcf86cd799439061",
  projectId: "507f1f77bcf86cd799439051",
  isPrimary: true,
};

function authAs(permission: string) {
  vi.mocked(requireAuth).mockResolvedValue({
    user: { id: "user-1", email: "a@b.com" },
  });
  vi.mocked(resolveWorkspace).mockResolvedValue({
    id: "ws-1",
    slug: "demo",
    name: "Demo",
    timezone: "UTC",
    defaultCurrency: "USD",
  });
  vi.mocked(requirePermission).mockResolvedValue({
    membership: {
      id: "m1",
      userId: "user-1",
      workspaceId: "ws-1",
      roleId: "role-1",
      status: "active",
      permissions: [permission],
    },
  });
}

const params = Promise.resolve({
  workspaceSlug: "demo",
  leadId: "507f1f77bcf86cd799439011",
  membershipId: "507f1f77bcf86cd799439061",
});

describe("lead project membership API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists memberships for lead:read", async () => {
    authAs("lead:read");
    vi.mocked(listLeadProjectMemberships).mockResolvedValue([membership] as never);

    const response = await getMemberships(new Request("http://localhost/memberships"), {
      params,
    });

    expect(response.status).toBe(200);
    expect(requirePermission).toHaveBeenCalledWith("ws-1", "user-1", "lead:read");
  });

  it("rejects unauthorized membership writes", async () => {
    vi.mocked(requireAuth).mockRejectedValue(
      new AppError("UNAUTHENTICATED", "Authentication required."),
    );

    const response = await postMembership(
      new Request("http://localhost/memberships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: "507f1f77bcf86cd799439051" }),
      }),
      { params },
    );

    expect(response.status).toBe(401);
  });

  it("adds, promotes, reorders, and removes memberships with lead:update", async () => {
    authAs("lead:update");
    vi.mocked(addLeadProjectMembership).mockResolvedValue([membership] as never);
    vi.mocked(setLeadProjectMembershipPrimary).mockResolvedValue([membership] as never);
    vi.mocked(reorderLeadProjectMemberships).mockResolvedValue([membership] as never);
    vi.mocked(removeLeadProjectMembership).mockResolvedValue([membership] as never);

    const created = await postMembership(
      new Request("http://localhost/memberships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: "507f1f77bcf86cd799439051" }),
      }),
      { params },
    );
    expect(created.status).toBe(201);
    expect(requirePermission).toHaveBeenCalledWith("ws-1", "user-1", "lead:update");

    const patched = await patchMembership(
      new Request("http://localhost/memberships", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPrimary: true }),
      }),
      { params },
    );
    expect(patched.status).toBe(200);
    expect(setLeadProjectMembershipPrimary).toHaveBeenCalled();

    const reordered = await reorderMemberships(
      new Request("http://localhost/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipIds: ["507f1f77bcf86cd799439061"] }),
      }),
      { params },
    );
    expect(reordered.status).toBe(200);

    const removed = await deleteMembership(new Request("http://localhost/memberships"), {
      params,
    });
    expect(removed.status).toBe(200);
    expect(removeLeadProjectMembership).toHaveBeenCalled();
  });
});
