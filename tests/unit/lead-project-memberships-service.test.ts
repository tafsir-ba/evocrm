import { beforeEach, describe, expect, it, vi } from "vitest";

import { leadRecordExtras, projectRecordExtras } from "@/tests/helpers/crm-fixtures";

vi.mock("@/server/repositories/leads", () => ({
  findLeadById: vi.fn(),
  findActiveLeadByEmailNormalized: vi.fn(),
  updateLead: vi.fn(),
}));

vi.mock("@/server/repositories/lead-project-memberships", () => ({
  archiveMembership: vi.fn(),
  createMembership: vi.fn(),
  findMembershipById: vi.fn(),
  findMembershipByLeadAndProject: vi.fn(),
  findMembershipsForLead: vi.fn(),
  findMembershipsForLeadIds: vi.fn(),
  updateMembership: vi.fn(),
}));

vi.mock("@/server/repositories/projects", () => ({
  findProjectById: vi.fn(),
}));

vi.mock("@/server/services/project-scope", () => ({
  validateActiveProjectId: vi.fn(),
}));

vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: vi.fn(),
}));

vi.mock("@/server/services/campaign-auto-enrollment", () => ({
  evaluateCampaignAutoEnrollmentForLead: vi.fn(),
}));

import { createAuditLog } from "@/server/audit/create-audit-log";
import {
  archiveMembership,
  createMembership,
  findMembershipById,
  findMembershipByLeadAndProject,
  findMembershipsForLead,
  updateMembership,
} from "@/server/repositories/lead-project-memberships";
import { findActiveLeadByEmailNormalized, findLeadById, updateLead } from "@/server/repositories/leads";
import { findProjectById } from "@/server/repositories/projects";
import { evaluateCampaignAutoEnrollmentForLead } from "@/server/services/campaign-auto-enrollment";
import {
  addLeadProjectMembership,
  removeLeadProjectMembership,
  reorderLeadProjectMemberships,
  setLeadProjectMembershipPrimary,
} from "@/server/services/lead-project-memberships";
import { validateActiveProjectId } from "@/server/services/project-scope";

const lead = {
  id: "lead-1",
  workspaceId: "ws-1",
  ...leadRecordExtras,
  projectId: "project-1",
  statusId: "status-1",
  firstName: "Ada",
  lastName: "Lovelace",
  fullName: "Ada Lovelace",
  email: "ada@example.com",
  emailNormalized: "ada@example.com",
  createdBy: "user-1",
  archivedAt: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const primaryMembership = {
  id: "mem-1",
  workspaceId: "ws-1",
  leadId: "lead-1",
  projectId: "project-1",
  isPrimary: true,
  joinedAt: new Date("2026-01-01T00:00:00.000Z"),
  sourceOrder: 0,
  source: "lead_create" as const,
  provenance: null,
  createdBy: "user-1",
  archivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const secondaryMembership = {
  ...primaryMembership,
  id: "mem-2",
  projectId: "project-2",
  isPrimary: false,
  sourceOrder: 1,
  source: "manual" as const,
};

function project(id: string, name: string) {
  return {
    id,
    workspaceId: "ws-1",
    name,
    reference: name,
    ...projectRecordExtras,
    statusId: null,
    address: null,
    city: null,
    country: null,
    description: null,
    createdBy: "user-1",
    ownerId: null,
    assignedTo: null,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("lead project membership service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findLeadById).mockResolvedValue(lead as never);
    vi.mocked(findActiveLeadByEmailNormalized).mockResolvedValue(null);
    vi.mocked(validateActiveProjectId).mockResolvedValue(undefined);
    vi.mocked(findProjectById).mockImplementation(async (_ws, projectId) =>
      project(projectId, projectId === "project-1" ? "Primary" : "Secondary"),
    );
    vi.mocked(findMembershipsForLead).mockResolvedValue([primaryMembership]);
    vi.mocked(findMembershipByLeadAndProject).mockResolvedValue(null);
    vi.mocked(createMembership).mockResolvedValue(secondaryMembership);
    vi.mocked(updateMembership).mockImplementation(async (_ws, id, input) => ({
      ...(id === "mem-1" ? primaryMembership : secondaryMembership),
      ...input,
    }));
    vi.mocked(archiveMembership).mockResolvedValue({
      ...secondaryMembership,
      archivedAt: new Date(),
      isPrimary: false,
    });
  });

  it("rejects duplicate project memberships", async () => {
    vi.mocked(findMembershipByLeadAndProject).mockResolvedValue(primaryMembership);

    await expect(
      addLeadProjectMembership({
        workspaceId: "ws-1",
        leadId: "lead-1",
        actorId: "user-1",
        projectId: "project-1",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(createMembership).not.toHaveBeenCalled();
    expect(evaluateCampaignAutoEnrollmentForLead).not.toHaveBeenCalled();
  });

  it("heals the current project as primary before adding a secondary when no memberships exist", async () => {
    const healedPrimary = { ...primaryMembership, source: "backfill" as const };
    vi.mocked(findMembershipsForLead)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([healedPrimary])
      .mockResolvedValueOnce([healedPrimary, secondaryMembership]);
    vi.mocked(findMembershipByLeadAndProject)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    vi.mocked(createMembership)
      .mockResolvedValueOnce(healedPrimary)
      .mockResolvedValueOnce(secondaryMembership);

    await addLeadProjectMembership({
      workspaceId: "ws-1",
      leadId: "lead-1",
      actorId: "user-1",
      projectId: "project-2",
      isPrimary: false,
    });

    expect(createMembership).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        projectId: "project-1",
        isPrimary: true,
        source: "backfill",
      }),
    );
    expect(createMembership).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        projectId: "project-2",
        isPrimary: false,
        source: "manual",
      }),
    );
    expect(updateLead).not.toHaveBeenCalled();
    expect(evaluateCampaignAutoEnrollmentForLead).not.toHaveBeenCalled();
  });

  it("adds a secondary membership without campaign enrollment", async () => {
    vi.mocked(findMembershipsForLead)
      .mockResolvedValueOnce([primaryMembership])
      .mockResolvedValueOnce([primaryMembership, secondaryMembership]);

    const memberships = await addLeadProjectMembership({
      workspaceId: "ws-1",
      leadId: "lead-1",
      actorId: "user-1",
      projectId: "project-2",
    });

    expect(createMembership).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-2",
        isPrimary: false,
        source: "manual",
      }),
    );
    expect(updateLead).not.toHaveBeenCalled();
    expect(evaluateCampaignAutoEnrollmentForLead).not.toHaveBeenCalled();
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "lead.project_membership_created",
        after: expect.objectContaining({ triggerAutomation: false }),
      }),
    );
    expect(memberships).toHaveLength(2);
  });

  it("rejects changing primary when the email already exists in the target project", async () => {
    vi.mocked(findMembershipById).mockResolvedValue(secondaryMembership);
    vi.mocked(findActiveLeadByEmailNormalized).mockResolvedValue({
      ...lead,
      id: "other-lead",
      projectId: "project-2",
    } as never);

    await expect(
      setLeadProjectMembershipPrimary({
        workspaceId: "ws-1",
        leadId: "lead-1",
        membershipId: "mem-2",
        actorId: "user-1",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(updateLead).not.toHaveBeenCalled();
    expect(evaluateCampaignAutoEnrollmentForLead).not.toHaveBeenCalled();
  });

  it("changes primary deliberately and syncs Lead.projectId without enrolling", async () => {
    vi.mocked(findMembershipById).mockResolvedValue(secondaryMembership);
    vi.mocked(findMembershipsForLead)
      .mockResolvedValueOnce([primaryMembership, secondaryMembership])
      .mockResolvedValueOnce([
        { ...primaryMembership, isPrimary: false },
        { ...secondaryMembership, isPrimary: true },
      ]);

    await setLeadProjectMembershipPrimary({
      workspaceId: "ws-1",
      leadId: "lead-1",
      membershipId: "mem-2",
      actorId: "user-1",
    });

    expect(updateMembership).toHaveBeenCalledWith("ws-1", "mem-1", { isPrimary: false });
    expect(updateMembership).toHaveBeenCalledWith("ws-1", "mem-2", { isPrimary: true });
    expect(updateLead).toHaveBeenCalledWith("ws-1", "lead-1", { projectId: "project-2" });
    expect(evaluateCampaignAutoEnrollmentForLead).not.toHaveBeenCalled();
  });

  it("restores the previous primary if promoting the new primary fails", async () => {
    vi.mocked(findMembershipById).mockResolvedValue(secondaryMembership);
    vi.mocked(findMembershipsForLead).mockResolvedValue([
      primaryMembership,
      secondaryMembership,
    ]);
    vi.mocked(updateMembership)
      .mockResolvedValueOnce({ ...primaryMembership, isPrimary: false })
      .mockRejectedValueOnce(new Error("write failed"));

    await expect(
      setLeadProjectMembershipPrimary({
        workspaceId: "ws-1",
        leadId: "lead-1",
        membershipId: "mem-2",
        actorId: "user-1",
      }),
    ).rejects.toThrow("write failed");

    expect(updateMembership).toHaveBeenCalledWith("ws-1", "mem-1", { isPrimary: false });
    expect(updateMembership).toHaveBeenCalledWith("ws-1", "mem-2", { isPrimary: true });
    expect(updateMembership).toHaveBeenCalledWith("ws-1", "mem-1", { isPrimary: true });
    expect(updateLead).not.toHaveBeenCalled();
  });

  it("prevents removing the last or current primary membership", async () => {
    vi.mocked(findMembershipById).mockResolvedValue(primaryMembership);

    await expect(
      removeLeadProjectMembership({
        workspaceId: "ws-1",
        leadId: "lead-1",
        membershipId: "mem-1",
        actorId: "user-1",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    vi.mocked(findMembershipsForLead).mockResolvedValue([
      primaryMembership,
      secondaryMembership,
    ]);

    await expect(
      removeLeadProjectMembership({
        workspaceId: "ws-1",
        leadId: "lead-1",
        membershipId: "mem-1",
        actorId: "user-1",
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    expect(archiveMembership).not.toHaveBeenCalled();
  });

  it("reorders memberships without changing primary or enrolling", async () => {
    vi.mocked(findMembershipsForLead)
      .mockResolvedValueOnce([primaryMembership, secondaryMembership])
      .mockResolvedValueOnce([secondaryMembership, primaryMembership]);

    await reorderLeadProjectMemberships({
      workspaceId: "ws-1",
      leadId: "lead-1",
      actorId: "user-1",
      membershipIds: ["mem-2", "mem-1"],
    });

    expect(updateMembership).toHaveBeenCalledWith("ws-1", "mem-2", { sourceOrder: 0 });
    expect(updateMembership).toHaveBeenCalledWith("ws-1", "mem-1", { sourceOrder: 1 });
    expect(updateLead).not.toHaveBeenCalled();
    expect(evaluateCampaignAutoEnrollmentForLead).not.toHaveBeenCalled();
  });
});
