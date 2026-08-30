import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/mongoose", () => ({
  connectDb: vi.fn(),
}));

vi.mock("@/models/lead", () => ({
  LeadModel: {
    find: vi.fn(),
  },
}));

vi.mock("@/server/repositories/lead-project-memberships", () => ({
  createMembership: vi.fn(),
  findLeadIdsMissingMembership: vi.fn(),
  findMembershipByLeadAndProject: vi.fn(),
}));

vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: vi.fn(),
}));

import { LeadModel } from "@/models/lead";
import { createAuditLog } from "@/server/audit/create-audit-log";
import {
  createMembership,
  findLeadIdsMissingMembership,
  findMembershipByLeadAndProject,
} from "@/server/repositories/lead-project-memberships";
import { backfillLeadProjectMemberships } from "@/server/services/lead-project-membership-backfill";

function mockFindPage(documents: unknown[]) {
  vi.mocked(LeadModel.find).mockReturnValue({
    sort: vi.fn().mockReturnValue({
      limit: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(documents),
        }),
      }),
    }),
  } as never);
}

describe("lead project membership backfill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findLeadIdsMissingMembership).mockResolvedValue(["lead-1"]);
    vi.mocked(findMembershipByLeadAndProject).mockResolvedValue(null);
    vi.mocked(createMembership).mockResolvedValue({ id: "mem-1" } as never);
  });

  it("creates a primary membership from the current project and stays idempotent", async () => {
    mockFindPage([
      {
        _id: { toString: () => "lead-1" },
        workspaceId: { toString: () => "ws-1" },
        projectId: "507f1f77bcf86cd799439011",
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
      },
    ]);

    const first = await backfillLeadProjectMemberships({
      workspaceId: "ws-1",
      actorId: "507f1f77bcf86cd799439099",
    });

    expect(first.created).toBe(1);
    expect(createMembership).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: "lead-1",
        projectId: "507f1f77bcf86cd799439011",
        isPrimary: true,
        source: "backfill",
      }),
    );
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "lead.project_memberships_backfilled",
        after: expect.objectContaining({ triggerAutomation: false }),
      }),
    );

    vi.mocked(findMembershipByLeadAndProject).mockResolvedValue({ id: "mem-1" } as never);
    vi.mocked(findLeadIdsMissingMembership).mockResolvedValue([]);
    mockFindPage([
      {
        _id: { toString: () => "lead-1" },
        workspaceId: { toString: () => "ws-1" },
        projectId: "507f1f77bcf86cd799439011",
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
      },
    ]);

    const second = await backfillLeadProjectMemberships({
      workspaceId: "ws-1",
      actorId: "507f1f77bcf86cd799439099",
    });

    expect(second.idempotentHits).toBe(1);
    expect(createMembership).toHaveBeenCalledTimes(1);
  });

  it("does not write in dry-run mode", async () => {
    mockFindPage([
      {
        _id: { toString: () => "lead-1" },
        workspaceId: { toString: () => "ws-1" },
        projectId: "507f1f77bcf86cd799439011",
        createdAt: new Date(),
      },
    ]);

    const result = await backfillLeadProjectMemberships({
      workspaceId: "ws-1",
      actorId: "507f1f77bcf86cd799439099",
      dryRun: true,
    });

    expect(result.created).toBe(1);
    expect(createMembership).not.toHaveBeenCalled();
    expect(createAuditLog).not.toHaveBeenCalled();
  });
});
