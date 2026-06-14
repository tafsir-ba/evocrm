import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/dashboard", () => ({
  countLeadsCreatedInRange: vi.fn(),
  countOpportunitiesByStatusIds: vi.fn(),
  countWonOpportunitiesInRange: vi.fn(),
  countLostOpportunitiesInRange: vi.fn(),
  sumOpportunityValuesByCurrency: vi.fn(),
  countActivitiesDueToday: vi.fn(),
  countOverdueActivities: vi.fn(),
  groupLeadsBySource: vi.fn(),
  groupOpportunitiesByStatus: vi.fn(),
  groupPropertiesByStatus: vi.fn(),
}));

vi.mock("@/server/repositories/activities", () => ({
  findActivities: vi.fn(),
}));

vi.mock("@/server/services/dictionary-items", () => ({
  listDictionaryItemsForWorkspace: vi.fn(),
  isOpenOpportunityBehavior: (behavior: string | undefined) => behavior === "open",
  isTerminalWonBehavior: (behavior: string | undefined) => behavior === "terminal_won",
  isTerminalLostBehavior: (behavior: string | undefined) => behavior === "terminal_lost",
  isActivityPendingBehavior: (behavior: string | undefined) => behavior === "pending",
}));

vi.mock("@/server/repositories/workspaces", () => ({
  findWorkspaceById: vi.fn(),
}));

vi.mock("@/server/services/activities", () => ({
  listActivitiesForWorkspace: vi.fn(),
  enrichActivityListItem: vi.fn(),
}));

vi.mock("@/server/services/opportunities", () => ({
  listOpportunitiesForWorkspace: vi.fn(),
}));

import { findActivities } from "@/server/repositories/activities";
import {
  countActivitiesDueToday,
  countLeadsCreatedInRange,
  countLostOpportunitiesInRange,
  countOpportunitiesByStatusIds,
  countOverdueActivities,
  countWonOpportunitiesInRange,
  groupLeadsBySource,
  groupOpportunitiesByStatus,
  groupPropertiesByStatus,
  sumOpportunityValuesByCurrency,
} from "@/server/repositories/dashboard";
import { findWorkspaceById } from "@/server/repositories/workspaces";
import {
  enrichActivityListItem,
  listActivitiesForWorkspace,
} from "@/server/services/activities";
import { listDictionaryItemsForWorkspace } from "@/server/services/dictionary-items";
import { listOpportunitiesForWorkspace } from "@/server/services/opportunities";
import {
  getDashboardActivitiesForWorkspace,
  getDashboardPipelineForWorkspace,
  getDashboardPropertiesForWorkspace,
  getDashboardSourcesForWorkspace,
  getDashboardSummaryForWorkspace,
  getRecentOpportunitiesForWorkspace,
} from "@/server/services/dashboard";

const workspaceId = "ws-1";

const opportunityStatuses = [
  {
    id: "status-open",
    workspaceId,
    dictionaryId: "dict-1",
    type: "opportunity_status" as const,
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
    id: "status-won",
    workspaceId,
    dictionaryId: "dict-1",
    type: "opportunity_status" as const,
    label: "Won",
    key: "won",
    color: "#22C55E",
    order: 6,
    isDefault: false,
    isActive: true,
    isSystem: true,
    behavior: "terminal_won",
    defaultProbability: 100,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "status-lost",
    workspaceId,
    dictionaryId: "dict-1",
    type: "opportunity_status" as const,
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
];

const activityStatuses = [
  {
    id: "status-pending",
    workspaceId,
    dictionaryId: "dict-2",
    type: "activity_status" as const,
    label: "Pending",
    key: "pending",
    color: "#3B82F6",
    order: 1,
    isDefault: true,
    isActive: true,
    isSystem: true,
    behavior: "pending",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "status-completed",
    workspaceId,
    dictionaryId: "dict-2",
    type: "activity_status" as const,
    label: "Completed",
    key: "completed",
    color: "#22C55E",
    order: 2,
    isDefault: false,
    isActive: true,
    isSystem: true,
    behavior: "completed",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

describe("dashboard service", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(findWorkspaceById).mockResolvedValue({
      id: workspaceId,
      name: "Demo",
      slug: "demo",
      type: "agency",
      timezone: "Europe/Zurich",
      defaultCurrency: "CHF",
      createdBy: "user-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    vi.mocked(listDictionaryItemsForWorkspace).mockImplementation(
      async (_workspaceId, filter) => {
        if (filter?.type === "opportunity_status") {
          return opportunityStatuses;
        }
        if (filter?.type === "activity_status") {
          return activityStatuses;
        }
        if (filter?.type === "lead_source") {
          return [
            {
              id: "source-web",
              workspaceId,
              dictionaryId: "dict-3",
              type: "lead_source" as const,
              label: "Website",
              key: "website",
              color: "#3B82F6",
              order: 1,
              isDefault: true,
              isActive: true,
              isSystem: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ];
        }
        if (filter?.type === "property_status") {
          return [
            {
              id: "prop-status-available",
              workspaceId,
              dictionaryId: "dict-4",
              type: "property_status" as const,
              label: "Available",
              key: "available",
              color: "#22C55E",
              order: 1,
              isDefault: true,
              isActive: true,
              isSystem: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ];
        }
        return [];
      },
    );
  });

  it("returns summary metrics scoped to workspace and date range", async () => {
    const dateFrom = new Date("2026-05-01T00:00:00.000Z");
    const dateTo = new Date("2026-06-01T00:00:00.000Z");

    vi.mocked(countLeadsCreatedInRange).mockResolvedValue(12);
    vi.mocked(countOpportunitiesByStatusIds).mockResolvedValue(8);
    vi.mocked(countWonOpportunitiesInRange).mockResolvedValue(3);
    vi.mocked(countLostOpportunitiesInRange).mockResolvedValue(2);
    vi.mocked(sumOpportunityValuesByCurrency).mockResolvedValue([
      { currency: "CHF", amount: 1000000 },
      { currency: "USD", amount: 250000 },
    ]);
    vi.mocked(countActivitiesDueToday).mockResolvedValue(5);
    vi.mocked(countOverdueActivities).mockResolvedValue(4);

    const result = await getDashboardSummaryForWorkspace(workspaceId, {
      dateFrom,
      dateTo,
    });

    expect(countLeadsCreatedInRange).toHaveBeenCalledWith(workspaceId, dateFrom, dateTo);
    expect(countOpportunitiesByStatusIds).toHaveBeenCalledWith(workspaceId, ["status-open"]);
    expect(countWonOpportunitiesInRange).toHaveBeenCalledWith(
      workspaceId,
      ["status-won"],
      dateFrom,
      dateTo,
    );
    expect(countLostOpportunitiesInRange).toHaveBeenCalledWith(
      workspaceId,
      ["status-lost"],
      dateFrom,
      dateTo,
    );
    expect(sumOpportunityValuesByCurrency).toHaveBeenCalledWith(workspaceId, ["status-open"]);
    expect(result.metrics.newLeads).toBe(12);
    expect(result.metrics.activeOpportunities).toBe(8);
    expect(result.metrics.activePipelineValue).toEqual([
      { currency: "CHF", amount: 1000000 },
      { currency: "USD", amount: 250000 },
    ]);
    expect(result.metrics.activitiesDueToday).toBe(5);
    expect(result.metrics.overdueActivities).toBe(4);
  });

  it("returns zero-safe summary when no data exists", async () => {
    vi.mocked(countLeadsCreatedInRange).mockResolvedValue(0);
    vi.mocked(countOpportunitiesByStatusIds).mockResolvedValue(0);
    vi.mocked(countWonOpportunitiesInRange).mockResolvedValue(0);
    vi.mocked(countLostOpportunitiesInRange).mockResolvedValue(0);
    vi.mocked(sumOpportunityValuesByCurrency).mockResolvedValue([]);
    vi.mocked(countActivitiesDueToday).mockResolvedValue(0);
    vi.mocked(countOverdueActivities).mockResolvedValue(0);

    const result = await getDashboardSummaryForWorkspace(workspaceId);

    expect(result.metrics.newLeads).toBe(0);
    expect(result.metrics.activePipelineValue).toEqual([]);
    expect(result.metrics.wonValue).toEqual([]);
  });

  it("builds pipeline stages from dictionary order with currency totals", async () => {
    vi.mocked(groupOpportunitiesByStatus).mockResolvedValue([
      {
        id: "status-open",
        count: 4,
        values: [{ currency: "CHF", amount: 500000 }],
      },
      {
        id: "status-lost",
        count: 1,
        values: [{ currency: "CHF", amount: 100000 }],
      },
    ]);
    vi.mocked(sumOpportunityValuesByCurrency).mockResolvedValue([
      { currency: "CHF", amount: 500000 },
    ]);

    const result = await getDashboardPipelineForWorkspace(workspaceId);

    expect(result.stages.map((stage) => stage.status.label)).toEqual([
      "New",
      "Won",
      "Lost",
    ]);
    expect(result.stages[0]?.count).toBe(4);
    expect(result.stages[0]?.includeInOverview).toBe(true);
    expect(result.stages[2]?.includeInOverview).toBe(false);
    expect(result.activePipelineValue).toEqual([{ currency: "CHF", amount: 500000 }]);
  });

  it("totals sources including orphan source ids", async () => {
    vi.mocked(groupLeadsBySource).mockResolvedValue([
      { id: "source-web", count: 5 },
      { id: "orphan-source", count: 3 },
    ]);

    const result = await getDashboardSourcesForWorkspace(workspaceId);

    expect(result.total).toBe(8);
    expect(result.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ count: 3, source: expect.objectContaining({ label: "Unknown source" }) }),
      ]),
    );
  });

  it("groups leads by source with unknown bucket", async () => {
    vi.mocked(groupLeadsBySource).mockResolvedValue([
      { id: "source-web", count: 5 },
      { id: null, count: 2 },
    ]);

    const result = await getDashboardSourcesForWorkspace(workspaceId);

    expect(result.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: expect.objectContaining({ label: "Website" }),
          count: 5,
        }),
        expect.objectContaining({
          source: null,
          count: 2,
        }),
      ]),
    );
    expect(result.total).toBe(7);
  });

  it("groups properties by dictionary status labels", async () => {
    vi.mocked(groupPropertiesByStatus).mockResolvedValue([
      { id: "prop-status-available", count: 6 },
    ]);

    const result = await getDashboardPropertiesForWorkspace(workspaceId);

    expect(result.statuses[0]).toEqual(
      expect.objectContaining({
        status: expect.objectContaining({ label: "Available" }),
        count: 6,
      }),
    );
    expect(result.total).toBe(6);
  });

  it("returns upcoming and overdue activity lists with limits", async () => {
    vi.mocked(countActivitiesDueToday).mockResolvedValue(1);
    vi.mocked(countOverdueActivities).mockResolvedValue(2);
    vi.mocked(findActivities).mockResolvedValue({
      activities: [
        {
          id: "act-1",
          workspaceId,
          opportunityId: null,
          leadId: null,
          propertyId: null,
          typeId: "type-1",
          statusId: "status-pending",
          ownerId: null,
          assignedTo: "user-1",
          title: "Call lead",
          description: null,
          dueDate: new Date(),
          completedAt: null,
          cancelledAt: null,
          outcome: null,
          nextActionDate: null,
          createdBy: "user-1",
          archivedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      total: 1,
    });
    vi.mocked(enrichActivityListItem).mockResolvedValue({
      id: "act-1",
      workspaceId,
      opportunityId: null,
      leadId: null,
      propertyId: null,
      typeId: "type-1",
      statusId: "status-pending",
      ownerId: null,
      assignedTo: "user-1",
      title: "Call lead",
      description: null,
      dueDate: new Date(),
      completedAt: null,
      cancelledAt: null,
      outcome: null,
      nextActionDate: null,
      createdBy: "user-1",
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      type: { id: "type-1", label: "Call", color: "#3B82F6", key: "call", behavior: undefined },
      status: {
        id: "status-pending",
        label: "Pending",
        color: "#3B82F6",
        key: "pending",
        behavior: "pending",
      },
      lead: null,
      property: null,
      opportunity: null,
      assignedUser: { id: "user-1", name: "Agent", email: "agent@example.com" },
      isOverdue: false,
      isUpcoming: true,
    });
    vi.mocked(listActivitiesForWorkspace).mockResolvedValue({
      activities: [],
      total: 0,
    });

    const result = await getDashboardActivitiesForWorkspace(workspaceId, { limit: 5 });

    expect(findActivities).toHaveBeenCalledWith(
      workspaceId,
      expect.objectContaining({ pageSize: 5, pendingStatusIds: ["status-pending"] }),
    );
    expect(result.dueToday.count).toBe(1);
    expect(result.overdue.count).toBe(2);
  });

  it("limits recent opportunities", async () => {
    vi.mocked(listOpportunitiesForWorkspace).mockResolvedValue({
      opportunities: [
        {
          id: "opp-1",
          workspaceId,
          leadId: "lead-1",
          propertyId: "prop-1",
          statusId: "status-open",
          ownerId: null,
          assignedTo: null,
          value: 100000,
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
          lead: { id: "lead-1", fullName: "Jane Doe", email: null, phone: null },
          property: {
            id: "prop-1",
            title: "Lake View",
            reference: "LV-01",
            price: null,
            currency: "CHF",
          },
          tagsResolved: [],
          assignedUser: null,
        },
      ],
      total: 1,
    });

    const result = await getRecentOpportunitiesForWorkspace(workspaceId, 5);

    expect(listOpportunitiesForWorkspace).toHaveBeenCalledWith(workspaceId, {
      page: 1,
      pageSize: 5,
      includeArchived: false,
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.leadName).toBe("Jane Doe");
  });
});
