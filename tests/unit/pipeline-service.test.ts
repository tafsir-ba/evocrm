import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/services/dictionary-items", () => ({
  listDictionaryItemsForWorkspace: vi.fn(),
}));

vi.mock("@/server/services/opportunities", () => ({
  listAllOpportunitiesForWorkspace: vi.fn(),
}));

vi.mock("@/server/repositories/workspaces", () => ({
  findWorkspaceById: vi.fn(),
}));

import { findWorkspaceById } from "@/server/repositories/workspaces";
import { listDictionaryItemsForWorkspace } from "@/server/services/dictionary-items";
import { listAllOpportunitiesForWorkspace } from "@/server/services/opportunities";
import { getPipelineForWorkspace } from "@/server/services/pipeline";

describe("pipeline service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findWorkspaceById).mockResolvedValue({
      id: "ws-1",
      name: "Demo",
      slug: "demo",
      type: "agency",
      timezone: "UTC",
      defaultCurrency: "CHF",
      createdBy: "user-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it("returns backend-driven columns from dictionary items", async () => {
    vi.mocked(listDictionaryItemsForWorkspace).mockResolvedValue([
      {
        id: "status-open",
        workspaceId: "ws-1",
        dictionaryId: "dict-1",
        type: "opportunity_status",
        label: "New",
        key: "new",
        color: "#3B82F6",
        order: 1,
        isDefault: true,
        isActive: true,
        isSystem: true,
        behavior: "open",
        defaultProbability: 10,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "status-lost",
        workspaceId: "ws-1",
        dictionaryId: "dict-1",
        type: "opportunity_status",
        label: "Lost",
        key: "lost",
        color: "#EF4444",
        order: 7,
        isDefault: false,
        isActive: true,
        isSystem: true,
        behavior: "terminal_lost",
        defaultProbability: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    vi.mocked(listAllOpportunitiesForWorkspace).mockResolvedValue([
      {
        id: "opp-open",
        workspaceId: "ws-1",
        leadId: "lead-1",
        propertyId: "prop-1",
        statusId: "status-open",
        ownerId: null,
        assignedTo: null,
        value: 500000,
        currency: "CHF",
        probability: 10,
        expectedCloseDate: null,
        lostReasonId: null,
        lostReasonText: null,
        closedAt: null,
        wonAt: null,
        lostAt: null,
        notes: null,
        tags: [],
        createdBy: "user-1",
        archivedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        status: {
          id: "status-open",
          label: "New",
          color: "#3B82F6",
          key: "new",
          behavior: "open",
        },
        lostReason: null,
        lead: null,
        property: null,
        tagsResolved: [],
        assignedUser: null,
      },
      {
        id: "opp-lost",
        workspaceId: "ws-1",
        leadId: "lead-2",
        propertyId: "prop-2",
        statusId: "status-lost",
        ownerId: null,
        assignedTo: null,
        value: 300000,
        currency: "CHF",
        probability: 0,
        expectedCloseDate: null,
        lostReasonId: "reason-1",
        lostReasonText: null,
        closedAt: new Date(),
        wonAt: null,
        lostAt: new Date(),
        notes: null,
        tags: [],
        createdBy: "user-1",
        archivedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        status: {
          id: "status-lost",
          label: "Lost",
          color: "#EF4444",
          key: "lost",
          behavior: "terminal_lost",
        },
        lostReason: null,
        lead: null,
        property: null,
        tagsResolved: [],
        assignedUser: null,
      },
    ] as never);

    const pipeline = await getPipelineForWorkspace("ws-1");

    expect(pipeline.columns).toHaveLength(2);
    expect(pipeline.columns[0].count).toBe(1);
    expect(pipeline.columns[1].count).toBe(1);
    expect(pipeline.totals.count).toBe(2);
    expect(pipeline.totals.activeValue).toBe(500000);
  });

  it("excludes non-workspace-currency values from active pipeline total", async () => {
    vi.mocked(listDictionaryItemsForWorkspace).mockResolvedValue([
      {
        id: "status-open",
        workspaceId: "ws-1",
        dictionaryId: "dict-1",
        type: "opportunity_status",
        label: "New",
        key: "new",
        color: "#3B82F6",
        order: 1,
        isDefault: true,
        isActive: true,
        isSystem: true,
        behavior: "open",
        defaultProbability: 10,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    vi.mocked(listAllOpportunitiesForWorkspace).mockResolvedValue([
      {
        id: "opp-chf",
        workspaceId: "ws-1",
        leadId: "lead-1",
        propertyId: "prop-1",
        statusId: "status-open",
        ownerId: null,
        assignedTo: null,
        value: 500000,
        currency: "CHF",
        probability: 10,
        expectedCloseDate: null,
        lostReasonId: null,
        lostReasonText: null,
        closedAt: null,
        wonAt: null,
        lostAt: null,
        notes: null,
        tags: [],
        createdBy: "user-1",
        archivedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        status: {
          id: "status-open",
          label: "New",
          color: "#3B82F6",
          key: "new",
          behavior: "open",
        },
        lostReason: null,
        lead: null,
        property: null,
        tagsResolved: [],
        assignedUser: null,
      },
      {
        id: "opp-usd",
        workspaceId: "ws-1",
        leadId: "lead-2",
        propertyId: "prop-2",
        statusId: "status-open",
        ownerId: null,
        assignedTo: null,
        value: 300000,
        currency: "USD",
        probability: 10,
        expectedCloseDate: null,
        lostReasonId: null,
        lostReasonText: null,
        closedAt: null,
        wonAt: null,
        lostAt: null,
        notes: null,
        tags: [],
        createdBy: "user-1",
        archivedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        status: {
          id: "status-open",
          label: "New",
          color: "#3B82F6",
          key: "new",
          behavior: "open",
        },
        lostReason: null,
        lead: null,
        property: null,
        tagsResolved: [],
        assignedUser: null,
      },
    ] as never);

    const pipeline = await getPipelineForWorkspace("ws-1");

    expect(pipeline.totals.activeValue).toBe(500000);
    expect(pipeline.columns[0].valueTotal).toBe(500000);
  });
});
