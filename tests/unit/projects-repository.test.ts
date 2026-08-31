import { beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";

vi.mock("@/server/db/mongoose", () => ({
  connectDb: vi.fn(),
}));

vi.mock("@/models/project", () => ({
  ProjectModel: {
    find: vi.fn(),
    findOne: vi.fn(),
  },
}));

vi.mock("@/models/lead", () => ({
  LeadModel: {
    find: vi.fn(),
    aggregate: vi.fn(),
  },
}));

vi.mock("@/models/property", () => ({
  PropertyModel: { aggregate: vi.fn() },
}));

vi.mock("@/models/opportunity", () => ({
  OpportunityModel: { aggregate: vi.fn() },
}));

vi.mock("@/models/campaign", () => ({
  CampaignModel: { find: vi.fn() },
}));

vi.mock("@/models/activity", () => ({
  ActivityModel: { aggregate: vi.fn() },
}));

import { ActivityModel } from "@/models/activity";
import { CampaignModel } from "@/models/campaign";
import { LeadModel } from "@/models/lead";
import { OpportunityModel } from "@/models/opportunity";
import { ProjectModel } from "@/models/project";
import { PropertyModel } from "@/models/property";
import { findProjectById, findProjects, findProjectsPage } from "@/server/repositories/projects";
import { TEST_PROJECT_ID } from "@/tests/helpers/crm-fixtures";

const WORKSPACE_ID = "507f1f77bcf86cd799439012";
const USER_ID = "507f1f77bcf86cd799439013";

function projectDocument() {
  return {
    _id: new mongoose.Types.ObjectId(TEST_PROJECT_ID),
    workspaceId: new mongoose.Types.ObjectId(WORKSPACE_ID),
    name: "Green View",
    reference: "GV",
    projectType: null,
    commercialStage: null,
    propertyTypeId: null,
    website: null,
    defaultDripCampaignId: null,
    statusId: null,
    address: null,
    city: "Geneva",
    country: "Switzerland",
    location: null,
    companies: [],
    description: null,
    createdBy: new mongoose.Types.ObjectId(USER_ID),
    ownerId: null,
    assignedTo: null,
    archivedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

function mockInboundCursor(leads: unknown[]) {
  const cursor = {
    async *[Symbol.asyncIterator]() {
      yield* leads;
    },
  };
  const lean = vi.fn().mockReturnValue({
    cursor: vi.fn().mockReturnValue(cursor),
  });
  const select = vi.fn().mockReturnValue({ lean });
  vi.mocked(LeadModel.find).mockReturnValue({ select } as never);
  return { select, lean };
}

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
    await findProjectById("ws-1", TEST_PROJECT_ID);

    expect(ProjectModel.findOne).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      _id: TEST_PROJECT_ID,
    });
  });

  it("filters and searches against normalized location fields", async () => {
    const lean = vi.fn().mockResolvedValue([]);
    const sort = vi.fn().mockReturnValue({ lean });
    vi.mocked(ProjectModel.find).mockReturnValue({ sort } as never);

    await findProjects("ws-1", {
      countryCode: "JM",
      cantonCode: "GE",
      municipality: "Kingston",
      search: "Kingston 8",
    });

    expect(ProjectModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        "location.countryCode": "JM",
        "location.cantonCode": "GE",
        "location.municipality": "Kingston",
        $or: expect.arrayContaining([
          { "location.municipality": expect.any(RegExp) },
          { "location.postalCode": expect.any(RegExp) },
        ]),
      }),
    );
  });

  it("returns null for invalid project ids without querying", async () => {
    const result = await findProjectById("ws-1", "project-1");

    expect(result).toBeNull();
    expect(ProjectModel.findOne).not.toHaveBeenCalled();
  });

  it("streams inbound leads with a cursor instead of buffering every document", async () => {
    vi.mocked(ProjectModel.find).mockReturnValue({
      lean: vi.fn().mockResolvedValue([projectDocument()]),
    } as never);
    vi.mocked(LeadModel.aggregate).mockResolvedValue([
      { _id: new mongoose.Types.ObjectId(TEST_PROJECT_ID), count: 2 },
    ]);
    vi.mocked(PropertyModel.aggregate).mockResolvedValue([]);
    vi.mocked(OpportunityModel.aggregate).mockResolvedValue([]);
    vi.mocked(ActivityModel.aggregate).mockResolvedValue([]);
    vi.mocked(CampaignModel.find).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      }),
    } as never);

    const receivedAt = new Date("2026-08-28T12:00:00.000Z");
    const { select } = mockInboundCursor([
      {
        projectId: new mongoose.Types.ObjectId(TEST_PROJECT_ID),
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        attributes: {
          integration: {
            inboundSource: "hubspot-gv-pilot",
            idempotencyKey: "hubspot:contact:1",
          },
        },
      },
      {
        projectId: new mongoose.Types.ObjectId(TEST_PROJECT_ID),
        createdAt: new Date("2026-01-02T00:00:00.000Z"),
        attributes: {
          integration: {
            integrationId: "int-website-gv",
            inboundSource: "landing-hero",
            receivedAt: receivedAt.toISOString(),
          },
        },
      },
    ]);

    const result = await findProjectsPage(WORKSPACE_ID, {
      withCounts: true,
      page: 1,
      pageSize: 25,
      view: "all",
      sort: "inbound",
    });

    expect(select).toHaveBeenCalledWith({
      projectId: 1,
      createdAt: 1,
      "attributes.integration": 1,
      "attributes.campaignEnrollmentPolicy": 1,
      "attributes.import": 1,
      intelligenceProvenance: 1,
    });
    expect(LeadModel.find).toHaveBeenCalledTimes(1);
    expect(result.projects).toHaveLength(1);
    expect(result.projects[0]?.counts?.leads).toBe(2);
    expect(result.projects[0]?.counts?.lastGenuineInboundAt).toEqual(receivedAt);
    expect(result.projects[0]?.counts?.lastGenuineInboundBasis).toBe("received_at");
    expect(PropertyModel.aggregate).toHaveBeenCalled();
    expect(CampaignModel.find).toHaveBeenCalled();
  });
});
