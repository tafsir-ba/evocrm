import "server-only";

import { listDictionaryItemsForWorkspace } from "@/server/services/dictionary-items";
import { listAllOpportunitiesForWorkspace } from "@/server/services/opportunities";
import type { OpportunityListItem } from "@/server/services/opportunities";
import type { OpportunityListFilter } from "@/server/repositories/opportunities";
import { findWorkspaceById } from "@/server/repositories/workspaces";

export type PipelineColumn = {
  status: {
    id: string;
    label: string;
    key: string;
    color: string;
    behavior?: string;
    defaultProbability?: number;
    order: number;
  };
  count: number;
  valueTotal: number;
  opportunities: OpportunityListItem[];
};

export type PipelineResult = {
  columns: PipelineColumn[];
  totals: {
    count: number;
    activeValue: number;
  };
};

export async function getPipelineForWorkspace(
  workspaceId: string,
  filter: Omit<OpportunityListFilter, "page" | "pageSize" | "includeArchived"> = {},
): Promise<PipelineResult> {
  const [stages, opportunities, workspace] = await Promise.all([
    listDictionaryItemsForWorkspace(workspaceId, { type: "opportunity_status" }),
    listAllOpportunitiesForWorkspace(workspaceId, {
      ...filter,
      includeArchived: false,
    }),
    findWorkspaceById(workspaceId),
  ]);

  const totalsCurrency = workspace?.defaultCurrency ?? "USD";

  const sumValuesForCurrency = (
    items: OpportunityListItem[],
    currency: string,
  ): number =>
    items
      .filter((opportunity) => opportunity.currency === currency)
      .reduce((sum, opportunity) => sum + (opportunity.value ?? 0), 0);

  const opportunitiesByStatus = new Map<string, OpportunityListItem[]>();

  for (const opportunity of opportunities) {
    const existing = opportunitiesByStatus.get(opportunity.statusId) ?? [];
    existing.push(opportunity);
    opportunitiesByStatus.set(opportunity.statusId, existing);
  }

  const columns: PipelineColumn[] = stages.map((stage) => {
    const stageOpportunities = opportunitiesByStatus.get(stage.id) ?? [];
    const valueTotal = sumValuesForCurrency(stageOpportunities, totalsCurrency);

    return {
      status: {
        id: stage.id,
        label: stage.label,
        key: stage.key,
        color: stage.color,
        behavior: stage.behavior,
        defaultProbability: stage.defaultProbability,
        order: stage.order,
      },
      count: stageOpportunities.length,
      valueTotal,
      opportunities: stageOpportunities,
    };
  });

  const activeValue = sumValuesForCurrency(
    opportunities.filter((opportunity) => opportunity.status?.behavior === "open"),
    totalsCurrency,
  );

  return {
    columns,
    totals: {
      count: opportunities.length,
      activeValue,
    },
  };
}
