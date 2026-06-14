import "server-only";

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
  type CurrencySum,
} from "@/server/repositories/dashboard";
import { findWorkspaceById } from "@/server/repositories/workspaces";
import {
  isActivityPendingBehavior,
  isOpenOpportunityBehavior,
  isTerminalLostBehavior,
  isTerminalWonBehavior,
  listDictionaryItemsForWorkspace,
} from "@/server/services/dictionary-items";
import { listActivitiesForWorkspace, enrichActivityListItem } from "@/server/services/activities";
import { listOpportunitiesForWorkspace } from "@/server/services/opportunities";
import {
  getDayBoundsInTimezone,
  resolveDashboardDateRange,
  type DashboardDateRange,
} from "@/server/utils/workspace-date-range";
import type { DashboardQuery } from "@/server/validation/dashboard";

export type DashboardDictionaryItem = {
  id: string;
  label: string;
  key: string;
  color: string;
  behavior?: string;
  order: number;
};

export type DashboardSummaryResult = {
  dateRange: DashboardDateRange;
  metrics: {
    newLeads: number;
    activeOpportunities: number;
    wonOpportunities: number;
    lostOpportunities: number;
    activePipelineValue: CurrencySum[];
    wonValue: CurrencySum[];
    activitiesDueToday: number;
    overdueActivities: number;
  };
};

export type DashboardPipelineStage = {
  status: DashboardDictionaryItem;
  count: number;
  valueByCurrency: CurrencySum[];
  includeInOverview: boolean;
};

export type DashboardPipelineResult = {
  dateRange: DashboardDateRange;
  stages: DashboardPipelineStage[];
  activePipelineValue: CurrencySum[];
  totalCount: number;
};

export type DashboardSourceItem = {
  source: DashboardDictionaryItem | null;
  count: number;
};

export type DashboardSourcesResult = {
  dateRange: DashboardDateRange;
  sources: DashboardSourceItem[];
  total: number;
};

export type DashboardPropertyStatusItem = {
  status: DashboardDictionaryItem;
  count: number;
};

export type DashboardPropertiesResult = {
  statuses: DashboardPropertyStatusItem[];
  total: number;
};

export type DashboardActivityItem = {
  id: string;
  title: string;
  dueDate: Date | null;
  type: { id: string; label: string; color: string; key: string } | null;
  assignedUser: { id: string; name: string | null; email: string } | null;
  relatedSummary: string | null;
};

export type DashboardActivitiesResult = {
  dateRange: DashboardDateRange;
  dueToday: {
    count: number;
    items: DashboardActivityItem[];
  };
  overdue: {
    count: number;
    items: DashboardActivityItem[];
  };
  upcoming: {
    items: DashboardActivityItem[];
  };
};

export type DashboardRecentOpportunity = {
  id: string;
  leadName: string | null;
  propertyTitle: string | null;
  propertyReference: string | null;
  status: { id: string; label: string; color: string; key: string; behavior?: string } | null;
  value: number | null;
  currency: string;
  updatedAt: Date;
  createdAt: Date;
};

export type DashboardFullResult = {
  summary: DashboardSummaryResult;
  pipeline: DashboardPipelineResult;
  activities: DashboardActivitiesResult;
  sources: DashboardSourcesResult;
  properties: DashboardPropertiesResult;
  recentOpportunities: DashboardRecentOpportunity[];
};

const DEFAULT_LIST_LIMIT = 10;

async function resolveWorkspaceContext(workspaceId: string) {
  const workspace = await findWorkspaceById(workspaceId);
  return {
    timezone: workspace?.timezone ?? "UTC",
    defaultCurrency: workspace?.defaultCurrency ?? "USD",
  };
}

async function resolveOpportunityStatusIds(workspaceId: string) {
  const items = await listDictionaryItemsForWorkspace(workspaceId, {
    type: "opportunity_status",
  });

  return {
    items,
    openIds: items.filter((item) => isOpenOpportunityBehavior(item.behavior)).map((i) => i.id),
    wonIds: items
      .filter((item) => isTerminalWonBehavior(item.behavior))
      .map((i) => i.id),
    lostIds: items
      .filter((item) => isTerminalLostBehavior(item.behavior))
      .map((i) => i.id),
  };
}

async function resolvePendingActivityStatusIds(workspaceId: string): Promise<string[]> {
  const items = await listDictionaryItemsForWorkspace(workspaceId, {
    type: "activity_status",
  });

  return items
    .filter((item) => isActivityPendingBehavior(item.behavior))
    .map((item) => item.id);
}

function toDictionaryItem(
  item: {
    id: string;
    label: string;
    key: string;
    color: string;
    behavior?: string;
    order: number;
  },
): DashboardDictionaryItem {
  return {
    id: item.id,
    label: item.label,
    key: item.key,
    color: item.color,
    behavior: item.behavior,
    order: item.order,
  };
}

function buildRelatedSummary(activity: {
  lead: { fullName: string } | null;
  property: { title: string; reference: string | null } | null;
  opportunity: { id: string } | null;
}): string | null {
  const parts: string[] = [];

  if (activity.lead) {
    parts.push(activity.lead.fullName);
  }

  if (activity.property) {
    parts.push(
      activity.property.reference
        ? `${activity.property.title} (${activity.property.reference})`
        : activity.property.title,
    );
  } else if (activity.opportunity) {
    parts.push("Opportunity");
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

function mapActivityListItem(activity: {
  id: string;
  title: string;
  dueDate: Date | null;
  type: { id: string; label: string; color: string; key: string } | null;
  assignedUser: { id: string; name: string | null; email: string } | null;
  lead: { fullName: string } | null;
  property: { title: string; reference: string | null } | null;
  opportunity: { id: string } | null;
}): DashboardActivityItem {
  return {
    id: activity.id,
    title: activity.title,
    dueDate: activity.dueDate,
    type: activity.type,
    assignedUser: activity.assignedUser,
    relatedSummary: buildRelatedSummary(activity),
  };
}

async function mapDueTodayActivityItems(
  workspaceId: string,
  pendingStatusIds: string[],
  dayStart: Date,
  dayEnd: Date,
  limit: number,
): Promise<DashboardActivityItem[]> {
  const { activities } = await findActivities(workspaceId, {
    pendingStatusIds,
    requireDueDate: true,
    dueFrom: dayStart,
    dueTo: dayEnd,
    page: 1,
    pageSize: limit,
    includeArchived: false,
  });

  const enriched = await Promise.all(
    activities.map((activity) => enrichActivityListItem(activity)),
  );

  return enriched.map(mapActivityListItem);
}

export async function getDashboardSummaryForWorkspace(
  workspaceId: string,
  query: DashboardQuery = {},
): Promise<DashboardSummaryResult> {
  const { timezone } = await resolveWorkspaceContext(workspaceId);
  const dateRange = resolveDashboardDateRange(query, timezone);
  const { openIds, wonIds, lostIds } = await resolveOpportunityStatusIds(workspaceId);
  const pendingStatusIds = await resolvePendingActivityStatusIds(workspaceId);
  const dayBounds = getDayBoundsInTimezone(dateRange.timezone);

  const [
    newLeads,
    activeOpportunities,
    wonOpportunities,
    lostOpportunities,
    activePipelineValue,
    wonValue,
    activitiesDueToday,
    overdueActivities,
  ] = await Promise.all([
    countLeadsCreatedInRange(workspaceId, dateRange.from, dateRange.to),
    countOpportunitiesByStatusIds(workspaceId, openIds),
    countWonOpportunitiesInRange(workspaceId, wonIds, dateRange.from, dateRange.to),
    countLostOpportunitiesInRange(workspaceId, lostIds, dateRange.from, dateRange.to),
    sumOpportunityValuesByCurrency(workspaceId, openIds),
    sumOpportunityValuesByCurrency(workspaceId, wonIds, {
      from: dateRange.from,
      to: dateRange.to,
      field: "won",
    }),
    countActivitiesDueToday(
      workspaceId,
      pendingStatusIds,
      dayBounds.start,
      dayBounds.end,
    ),
    countOverdueActivities(workspaceId, pendingStatusIds, new Date()),
  ]);

  return {
    dateRange,
    metrics: {
      newLeads,
      activeOpportunities,
      wonOpportunities,
      lostOpportunities,
      activePipelineValue,
      wonValue,
      activitiesDueToday,
      overdueActivities,
    },
  };
}

export async function getDashboardPipelineForWorkspace(
  workspaceId: string,
  query: DashboardQuery = {},
): Promise<DashboardPipelineResult> {
  const { timezone } = await resolveWorkspaceContext(workspaceId);
  const dateRange = resolveDashboardDateRange(query, timezone);
  const { items: stages, openIds } = await resolveOpportunityStatusIds(workspaceId);
  const grouped = await groupOpportunitiesByStatus(workspaceId);
  const groupedMap = new Map(grouped.map((row) => [row.id, row]));

  const pipelineStages: DashboardPipelineStage[] = stages.map((stage) => {
    const row = groupedMap.get(stage.id);
    return {
      status: toDictionaryItem(stage),
      count: row?.count ?? 0,
      valueByCurrency: row?.values ?? [],
      includeInOverview: !isTerminalLostBehavior(stage.behavior),
    };
  });

  const openValueRows = await sumOpportunityValuesByCurrency(workspaceId, openIds);

  return {
    dateRange,
    stages: pipelineStages,
    activePipelineValue: openValueRows,
    totalCount: grouped.reduce((sum, row) => sum + row.count, 0),
  };
}

export async function getDashboardSourcesForWorkspace(
  workspaceId: string,
  query: DashboardQuery = {},
): Promise<DashboardSourcesResult> {
  const { timezone } = await resolveWorkspaceContext(workspaceId);
  const dateRange = resolveDashboardDateRange(query, timezone);
  const [sourceItems, grouped] = await Promise.all([
    listDictionaryItemsForWorkspace(workspaceId, { type: "lead_source" }),
    groupLeadsBySource(workspaceId, dateRange.from, dateRange.to),
  ]);

  const sourceMap = new Map(sourceItems.map((item) => [item.id, item]));
  const usedIds = new Set(grouped.map((row) => row.id).filter(Boolean) as string[]);

  const sources: DashboardSourceItem[] = sourceItems
    .filter((item) => usedIds.has(item.id))
    .map((item) => ({
      source: toDictionaryItem(item),
      count: grouped.find((row) => row.id === item.id)?.count ?? 0,
    }))
    .sort((a, b) => b.count - a.count);

  const unknownCount =
    grouped.find((row) => row.id === null)?.count ?? 0;

  if (unknownCount > 0) {
    sources.push({
      source: null,
      count: unknownCount,
    });
  }

  for (const row of grouped) {
    if (row.id && !sourceMap.has(row.id)) {
      sources.push({
        source: {
          id: row.id,
          label: "Unknown source",
          key: "unknown",
          color: "#94A3B8",
          order: 999,
        },
        count: row.count,
      });
    }
  }

  const total = sources.reduce((sum, item) => sum + item.count, 0);

  return {
    dateRange,
    sources,
    total,
  };
}

export async function getDashboardPropertiesForWorkspace(
  workspaceId: string,
): Promise<DashboardPropertiesResult> {
  const [statusItems, grouped] = await Promise.all([
    listDictionaryItemsForWorkspace(workspaceId, { type: "property_status" }),
    groupPropertiesByStatus(workspaceId),
  ]);

  const groupedMap = new Map(grouped.map((row) => [row.id, row.count]));

  const statuses: DashboardPropertyStatusItem[] = statusItems
    .map((item) => ({
      status: toDictionaryItem(item),
      count: groupedMap.get(item.id) ?? 0,
    }))
    .sort((a, b) => a.status.order - b.status.order);

  for (const row of grouped) {
    if (row.id && !statuses.some((item) => item.status.id === row.id)) {
      statuses.push({
        status: {
          id: row.id,
          label: "Unknown status",
          key: "unknown",
          color: "#94A3B8",
          order: 999,
        },
        count: row.count,
      });
    }
  }

  const total = statuses.reduce((sum, item) => sum + item.count, 0);

  return { statuses, total };
}

export async function getDashboardActivitiesForWorkspace(
  workspaceId: string,
  query: DashboardQuery = {},
): Promise<DashboardActivitiesResult> {
  const { timezone } = await resolveWorkspaceContext(workspaceId);
  const dateRange = resolveDashboardDateRange(query, timezone);
  const pendingStatusIds = await resolvePendingActivityStatusIds(workspaceId);
  const limit = query.limit ?? DEFAULT_LIST_LIMIT;
  const now = new Date();
  const dayBounds = getDayBoundsInTimezone(dateRange.timezone, now);

  const [dueTodayCount, overdueCount, dueTodayItems, overdueItems, upcomingItems] =
    await Promise.all([
      countActivitiesDueToday(
        workspaceId,
        pendingStatusIds,
        dayBounds.start,
        dayBounds.end,
      ),
      countOverdueActivities(workspaceId, pendingStatusIds, now),
      mapDueTodayActivityItems(
        workspaceId,
        pendingStatusIds,
        dayBounds.start,
        dayBounds.end,
        limit,
      ),
      listActivitiesForWorkspace(workspaceId, {
        page: 1,
        pageSize: limit,
        includeArchived: false,
        view: "overdue",
      }).then(({ activities }) => activities.map(mapActivityListItem)),
      listActivitiesForWorkspace(workspaceId, {
        page: 1,
        pageSize: limit,
        includeArchived: false,
        view: "upcoming",
      }).then(({ activities }) => activities.map(mapActivityListItem)),
    ]);

  return {
    dateRange,
    dueToday: {
      count: dueTodayCount,
      items: dueTodayItems,
    },
    overdue: {
      count: overdueCount,
      items: overdueItems,
    },
    upcoming: {
      items: upcomingItems,
    },
  };
}

export async function getRecentOpportunitiesForWorkspace(
  workspaceId: string,
  limit: number = DEFAULT_LIST_LIMIT,
): Promise<DashboardRecentOpportunity[]> {
  const { opportunities } = await listOpportunitiesForWorkspace(workspaceId, {
    page: 1,
    pageSize: limit,
    includeArchived: false,
  });

  return opportunities.map((opportunity) => ({
    id: opportunity.id,
    leadName: opportunity.lead?.fullName ?? null,
    propertyTitle: opportunity.property?.title ?? null,
    propertyReference: opportunity.property?.reference ?? null,
    status: opportunity.status,
    value: opportunity.value,
    currency: opportunity.currency,
    updatedAt: opportunity.updatedAt,
    createdAt: opportunity.createdAt,
  }));
}

export async function getDashboardForWorkspace(
  workspaceId: string,
  query: DashboardQuery = {},
): Promise<DashboardFullResult> {
  const [summary, pipeline, activities, sources, properties, recentOpportunities] =
    await Promise.all([
      getDashboardSummaryForWorkspace(workspaceId, query),
      getDashboardPipelineForWorkspace(workspaceId, query),
      getDashboardActivitiesForWorkspace(workspaceId, query),
      getDashboardSourcesForWorkspace(workspaceId, query),
      getDashboardPropertiesForWorkspace(workspaceId),
      getRecentOpportunitiesForWorkspace(workspaceId, query.limit ?? DEFAULT_LIST_LIMIT),
    ]);

  return {
    summary,
    pipeline,
    activities,
    sources,
    properties,
    recentOpportunities,
  };
}
