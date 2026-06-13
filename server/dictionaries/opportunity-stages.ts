import "server-only";

import { findWorkspaceBySlug } from "@/server/repositories/workspaces";
import { listDictionaryItemsForWorkspace } from "@/server/services/dictionary-items";
import type { DictionaryItemRecord } from "@/server/repositories/dictionary-items";

export async function getOpportunityStatusStagesForSlug(
  workspaceSlug: string,
): Promise<DictionaryItemRecord[]> {
  const workspace = await findWorkspaceBySlug(workspaceSlug);

  if (!workspace) {
    return [];
  }

  return listDictionaryItemsForWorkspace(workspace.id, {
    type: "opportunity_status",
  });
}
