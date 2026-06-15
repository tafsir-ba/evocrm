import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/permissions/owner-protection", () => ({
  requireWorkspaceOwner: vi.fn(),
}));

vi.mock("@/server/repositories/workspaces", () => ({
  findWorkspaceById: vi.fn(),
  deleteWorkspaceById: vi.fn(),
}));

vi.mock("@/server/db/mongoose", () => ({
  connectDb: vi.fn(),
}));

vi.mock("@/server/storage/spaces", () => ({
  deleteObject: vi.fn(),
}));

vi.mock("@/models/campaign-send", () => ({
  CampaignSendModel: { deleteMany: vi.fn() },
}));
vi.mock("@/models/campaign-enrollment", () => ({
  CampaignEnrollmentModel: { deleteMany: vi.fn() },
}));
vi.mock("@/models/campaign-step", () => ({
  CampaignStepModel: { deleteMany: vi.fn() },
}));
vi.mock("@/models/campaign", () => ({
  CampaignModel: { deleteMany: vi.fn() },
}));
vi.mock("@/models/document", () => ({
  DocumentModel: {
    find: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) }),
    deleteMany: vi.fn(),
  },
}));
vi.mock("@/models/activity", () => ({
  ActivityModel: { deleteMany: vi.fn() },
}));
vi.mock("@/models/opportunity", () => ({
  OpportunityModel: { deleteMany: vi.fn() },
}));
vi.mock("@/models/lead", () => ({
  LeadModel: { deleteMany: vi.fn() },
}));
vi.mock("@/models/property", () => ({
  PropertyModel: { deleteMany: vi.fn() },
}));
vi.mock("@/models/project", () => ({
  ProjectModel: { deleteMany: vi.fn() },
}));
vi.mock("@/models/integration-log", () => ({
  IntegrationLogModel: { deleteMany: vi.fn() },
}));
vi.mock("@/models/integration", () => ({
  IntegrationModel: { deleteMany: vi.fn() },
}));
vi.mock("@/models/dictionary-item", () => ({
  DictionaryItemModel: { deleteMany: vi.fn() },
}));
vi.mock("@/models/dictionary", () => ({
  DictionaryModel: { deleteMany: vi.fn() },
}));
vi.mock("@/models/tag", () => ({
  TagModel: { deleteMany: vi.fn() },
}));
vi.mock("@/models/membership", () => ({
  MembershipModel: { deleteMany: vi.fn() },
}));
vi.mock("@/models/role", () => ({
  RoleModel: { deleteMany: vi.fn() },
}));
vi.mock("@/models/audit-log", () => ({
  AuditLogModel: { deleteMany: vi.fn() },
}));
vi.mock("@/models/feedback", () => ({
  FeedbackModel: {
    find: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) }),
    deleteMany: vi.fn(),
  },
}));

import { requireWorkspaceOwner } from "@/server/permissions/owner-protection";
import { DocumentModel } from "@/models/document";
import { FeedbackModel } from "@/models/feedback";
import {
  deleteWorkspaceById,
  findWorkspaceById,
} from "@/server/repositories/workspaces";
import { deleteWorkspaceForOwner } from "@/server/services/workspace-deletion";

function mockLeanQuery<T>(value: T[]) {
  return {
    select: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(value),
    }),
  };
}

describe("workspace deletion service", () => {
  beforeEach(() => {
    vi.mocked(findWorkspaceById).mockReset();
    vi.mocked(deleteWorkspaceById).mockReset();
    vi.mocked(requireWorkspaceOwner).mockReset();
    vi.mocked(DocumentModel.find).mockReturnValue(mockLeanQuery([]) as never);
    vi.mocked(FeedbackModel.find).mockReturnValue(mockLeanQuery([]) as never);
  });

  it("rejects when confirmation name does not match", async () => {
    vi.mocked(findWorkspaceById).mockResolvedValue({
      id: "507f1f77bcf86cd799439011",
      name: "Evo CRM",
      slug: "evo-crm",
      type: "agency",
      timezone: "UTC",
      defaultCurrency: "USD",
      createdBy: "user-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      deleteWorkspaceForOwner({
        workspaceId: "507f1f77bcf86cd799439011",
        actorUserId: "user-1",
        confirmation: { confirmName: "Wrong name" },
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });

    expect(requireWorkspaceOwner).toHaveBeenCalledWith("507f1f77bcf86cd799439011", "user-1");
    expect(deleteWorkspaceById).not.toHaveBeenCalled();
  });

  it("deletes workspace data when owner confirms name", async () => {
    vi.mocked(findWorkspaceById).mockResolvedValue({
      id: "507f1f77bcf86cd799439011",
      name: "Evo CRM",
      slug: "evo-crm",
      type: "agency",
      timezone: "UTC",
      defaultCurrency: "USD",
      createdBy: "user-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await deleteWorkspaceForOwner({
      workspaceId: "507f1f77bcf86cd799439011",
      actorUserId: "user-1",
      confirmation: { confirmName: "Evo CRM" },
    });

    expect(requireWorkspaceOwner).toHaveBeenCalledWith("507f1f77bcf86cd799439011", "user-1");
    expect(deleteWorkspaceById).toHaveBeenCalledWith("507f1f77bcf86cd799439011");
    expect(result).toEqual({ slug: "evo-crm" });
  });
});
