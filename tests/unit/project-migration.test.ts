import { beforeEach, describe, expect, it, vi } from "vitest";

import { TEST_PROJECT_ID } from "@/tests/helpers/crm-fixtures";

vi.mock("@/server/db/mongoose", () => ({
  connectDb: vi.fn(),
}));

vi.mock("@/server/repositories/projects", () => ({
  findProjectByReference: vi.fn(),
  findProjects: vi.fn(),
  createProject: vi.fn(),
}));

vi.mock("@/models/property", () => ({
  PropertyModel: { updateMany: vi.fn() },
}));

vi.mock("@/models/lead", () => ({
  LeadModel: { updateMany: vi.fn(), findOne: vi.fn() },
}));

vi.mock("@/models/opportunity", () => ({
  OpportunityModel: {
    find: vi.fn(),
    findOne: vi.fn(),
    updateOne: vi.fn(),
  },
}));

vi.mock("@/models/activity", () => ({
  ActivityModel: {
    find: vi.fn(),
    updateOne: vi.fn(),
  },
}));

vi.mock("@/models/campaign", () => ({
  CampaignModel: { updateMany: vi.fn() },
}));

vi.mock("@/models/campaign-enrollment", () => ({
  CampaignEnrollmentModel: {
    find: vi.fn(),
    updateOne: vi.fn(),
  },
}));

import { ActivityModel } from "@/models/activity";
import { CampaignEnrollmentModel } from "@/models/campaign-enrollment";
import { CampaignModel } from "@/models/campaign";
import { LeadModel } from "@/models/lead";
import { OpportunityModel } from "@/models/opportunity";
import { PropertyModel } from "@/models/property";
import {
  createProject,
  findProjectByReference,
  findProjects,
} from "@/server/repositories/projects";
import { migrateWorkspaceProjectScope } from "@/server/services/project-migration";

describe("migrateWorkspaceProjectScope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findProjectByReference).mockResolvedValue({
      id: TEST_PROJECT_ID,
      workspaceId: "507f1f77bcf86cd799439012",
      name: "Default Project",
      reference: "default",
      projectType: null,
      defaultDripCampaignId: null,
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
    vi.mocked(PropertyModel.updateMany).mockResolvedValue({ modifiedCount: 2 } as never);
    vi.mocked(LeadModel.updateMany).mockResolvedValue({ modifiedCount: 3 } as never);
    vi.mocked(OpportunityModel.find).mockReturnValue({
      lean: vi.fn().mockResolvedValue([]),
    } as never);
    vi.mocked(ActivityModel.find).mockReturnValue({
      lean: vi.fn().mockResolvedValue([]),
    } as never);
    vi.mocked(CampaignModel.updateMany).mockResolvedValue({ modifiedCount: 0 } as never);
    vi.mocked(CampaignEnrollmentModel.find).mockReturnValue({
      lean: vi.fn().mockResolvedValue([]),
    } as never);
  });

  it("reuses the default project and is idempotent on repeated runs", async () => {
    const first = await migrateWorkspaceProjectScope("507f1f77bcf86cd799439012", "507f1f77bcf86cd799439013");
    const second = await migrateWorkspaceProjectScope("507f1f77bcf86cd799439012", "507f1f77bcf86cd799439013");

    expect(findProjectByReference).toHaveBeenCalledWith("507f1f77bcf86cd799439012", "default");
    expect(createProject).not.toHaveBeenCalled();
    expect(first.defaultProjectId).toBe(TEST_PROJECT_ID);
    expect(second.defaultProjectId).toBe(TEST_PROJECT_ID);
    expect(first.propertiesUpdated).toBe(2);
    expect(second.propertiesUpdated).toBe(2);
  });

  it("creates a default project when none exists", async () => {
    vi.mocked(findProjectByReference).mockResolvedValue(null);
    vi.mocked(findProjects).mockResolvedValue([]);
    vi.mocked(createProject).mockResolvedValue({
      id: "507f1f77bcf86cd799439014",
      workspaceId: "507f1f77bcf86cd799439012",
      name: "Default Project",
      reference: "default",
      projectType: null,
      defaultDripCampaignId: null,
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

    const result = await migrateWorkspaceProjectScope("507f1f77bcf86cd799439012", "507f1f77bcf86cd799439013");

    expect(createProject).toHaveBeenCalled();
    expect(result.defaultProjectId).toBe("507f1f77bcf86cd799439014");
  });
});
