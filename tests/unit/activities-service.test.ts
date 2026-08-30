import { beforeEach, describe, expect, it, vi } from "vitest";

import { activityRecordExtras, opportunityRecordExtras, projectRecordExtras } from "@/tests/helpers/crm-fixtures";

vi.mock("@/server/repositories/activities", () => ({
  findActivityById: vi.fn(),
  createActivity: vi.fn(),
  updateActivity: vi.fn(),
  archiveActivity: vi.fn(),
  findActivities: vi.fn(),
}));

vi.mock("@/server/repositories/leads", () => ({
  findLeadById: vi.fn(),
}));

vi.mock("@/server/repositories/properties", () => ({
  findPropertyById: vi.fn(),
}));

vi.mock("@/server/repositories/opportunities", () => ({
  findOpportunityById: vi.fn(),
}));

vi.mock("@/server/repositories/memberships", () => ({
  findMembership: vi.fn(),
}));

vi.mock("@/server/repositories/dictionary-items", () => ({
  findDictionaryItemById: vi.fn(),
  findDictionaryItemByTypeAndBehavior: vi.fn(),
  findDictionaryItems: vi.fn(),
}));

vi.mock("@/server/repositories/users", () => ({
  findUserById: vi.fn(),
}));

vi.mock("@/server/repositories/projects", () => ({
  findProjectById: vi.fn(),
}));

vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: vi.fn(),
}));

import { findDictionaryItemById, findDictionaryItemByTypeAndBehavior } from "@/server/repositories/dictionary-items";
import { findLeadById } from "@/server/repositories/leads";
import { findOpportunityById } from "@/server/repositories/opportunities";
import { findPropertyById } from "@/server/repositories/properties";
import { findProjectById } from "@/server/repositories/projects";
import {
  archiveActivity,
  createActivity,
  findActivityById,
  updateActivity,
} from "@/server/repositories/activities";
import { applyActivityStatusBehavior } from "@/server/services/activity-status";
import {
  archiveActivityForWorkspace,
  cancelActivityForWorkspace,
  completeActivityForWorkspace,
  createActivityForWorkspace,
} from "@/server/services/activities";
import { AppError } from "@/server/errors";

const pendingStatus = {
  id: "status-pending",
  workspaceId: "ws-1",
  dictionaryId: "dict-1",
  type: "activity_status" as const,
  label: "Pending",
  key: "pending",
  color: "#888",
  order: 0,
  isDefault: true,
  isActive: true,
  isSystem: true,
  behavior: "pending",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const completedStatus = {
  ...pendingStatus,
  id: "status-completed",
  label: "Completed",
  key: "completed",
  behavior: "completed",
};

const cancelledStatus = {
  ...pendingStatus,
  id: "status-cancelled",
  label: "Cancelled",
  key: "cancelled",
  behavior: "cancelled",
};

const activityType = {
  id: "type-call",
  workspaceId: "ws-1",
  dictionaryId: "dict-2",
  type: "activity_type" as const,
  label: "Call",
  key: "call",
  color: "#000",
  order: 0,
  isDefault: true,
  isActive: true,
  isSystem: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const baseActivity = {
  id: "act-1",
  workspaceId: "ws-1",
  ...activityRecordExtras,
  projectId: "project-1",
  opportunityId: null,
  leadId: "lead-1",
  propertyId: null,
  typeId: "type-call",
  statusId: "status-pending",
  ownerId: null,
  assignedTo: "user-1",
  title: "Call lead",
  description: null,
  dueDate: new Date("2026-01-01T00:00:00.000Z"),
  completedAt: null,
  cancelledAt: null,
  outcome: null,
  nextActionDate: null,
  createdBy: "user-1",
  archivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("activity status behavior", () => {
  it("sets completedAt and clears cancelledAt for completed behavior", () => {
    const result = applyActivityStatusBehavior(
      { behavior: "completed" },
      new Date("2026-06-01T00:00:00.000Z"),
    );

    expect(result.completedAt?.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(result.cancelledAt).toBeNull();
  });

  it("sets cancelledAt and clears completedAt for cancelled behavior", () => {
    const result = applyActivityStatusBehavior(
      { behavior: "cancelled" },
      new Date("2026-06-01T00:00:00.000Z"),
    );

    expect(result.cancelledAt?.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(result.completedAt).toBeNull();
  });

  it("clears terminal timestamps for pending behavior", () => {
    const result = applyActivityStatusBehavior({ behavior: "pending" });
    expect(result.completedAt).toBeNull();
    expect(result.cancelledAt).toBeNull();
  });
});

describe("activities service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findDictionaryItemById).mockImplementation(async (_ws, id) => {
      if (id === "status-pending") return pendingStatus;
      if (id === "status-completed") return completedStatus;
      if (id === "status-cancelled") return cancelledStatus;
      if (id === "type-call") return activityType;
      return null;
    });
    vi.mocked(findLeadById).mockResolvedValue({
      id: "lead-1",
      workspaceId: "ws-1",
      projectId: "project-1",
      archivedAt: null,
      fullName: "Jane Doe",
      email: null,
    } as never);
    vi.mocked(findPropertyById).mockResolvedValue(null);
    vi.mocked(findOpportunityById).mockResolvedValue(null);
    vi.mocked(findProjectById).mockResolvedValue({
      id: "project-1",
      workspaceId: "ws-1",
      name: "Default Project",
      reference: "default",
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
    });
    vi.mocked(createActivity).mockResolvedValue(baseActivity);
    vi.mocked(findActivityById).mockResolvedValue(baseActivity);
    vi.mocked(updateActivity).mockImplementation(async (_ws, _id, input) => ({
      ...baseActivity,
      ...input,
      statusId: input.statusId ?? baseActivity.statusId,
    }));
    vi.mocked(archiveActivity).mockResolvedValue({
      ...baseActivity,
      archivedAt: new Date(),
    });
    vi.mocked(findDictionaryItemByTypeAndBehavior).mockImplementation(
      async (_ws, _type, behavior) => {
        if (behavior === "completed") return completedStatus;
        if (behavior === "cancelled") return cancelledStatus;
        return pendingStatus;
      },
    );
  });

  it("creates activity with server-controlled workspaceId and createdBy", async () => {
    await createActivityForWorkspace("ws-1", "user-1", {
      leadId: "lead-1",
      typeId: "type-call",
      statusId: "status-pending",
      title: "Call lead",
    });

    expect(createActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        createdBy: "user-1",
        leadId: "lead-1",
      }),
    );
  });

  it("rejects create without linked entity", async () => {
    await expect(
      createActivityForWorkspace("ws-1", "user-1", {
        typeId: "type-call",
        statusId: "status-pending",
        title: "Orphan activity",
      } as never),
    ).rejects.toThrow(AppError);
  });

  it("derives lead and property from opportunity", async () => {
    vi.mocked(findOpportunityById).mockResolvedValue({
      id: "opp-1",
      workspaceId: "ws-1",
      projectId: "project-1",
      leadId: "lead-1",
      propertyId: "prop-1",
      archivedAt: null,
    } as never);

    await createActivityForWorkspace("ws-1", "user-1", {
      opportunityId: "opp-1",
      typeId: "type-call",
      statusId: "status-pending",
      title: "Visit",
    });

    expect(createActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        opportunityId: "opp-1",
        leadId: "lead-1",
        propertyId: "prop-1",
      }),
    );
  });

  it("completes activity using behavior not label", async () => {
    await completeActivityForWorkspace("ws-1", "act-1", "user-1", {});

    expect(findDictionaryItemByTypeAndBehavior).toHaveBeenCalledWith(
      "ws-1",
      "activity_status",
      "completed",
    );
    expect(updateActivity).toHaveBeenCalledWith(
      "ws-1",
      "act-1",
      expect.objectContaining({
        statusId: "status-completed",
        completedAt: expect.any(Date),
        cancelledAt: null,
      }),
    );
  });

  it("cancels activity using behavior not label", async () => {
    await cancelActivityForWorkspace("ws-1", "act-1", "user-1", {});

    expect(findDictionaryItemByTypeAndBehavior).toHaveBeenCalledWith(
      "ws-1",
      "activity_status",
      "cancelled",
    );
    expect(updateActivity).toHaveBeenCalledWith(
      "ws-1",
      "act-1",
      expect.objectContaining({
        statusId: "status-cancelled",
        cancelledAt: expect.any(Date),
        completedAt: null,
      }),
    );
  });

  it("archives activity without hard delete", async () => {
    await archiveActivityForWorkspace("ws-1", "act-1", "user-1");

    expect(archiveActivity).toHaveBeenCalledWith("ws-1", "act-1");
  });
});
