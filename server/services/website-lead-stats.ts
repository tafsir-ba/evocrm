import "server-only";

import { AppError } from "@/server/errors";
import {
  findActiveWebsiteIntegrationByApiKeyHash,
} from "@/server/repositories/integrations";
import { countActiveLeadsForWorkspace } from "@/server/repositories/leads";
import {
  hashIntegrationApiKey,
  parseIntegrationApiKeyFromRequest,
} from "@/server/services/integration-api-keys";

export type WebsiteLeadStats = {
  totalLeads: number;
  workspaceId: string;
};

/**
 * Public marketing-site stats: workspace-scoped active lead total.
 * Auth uses the same website integration API key as lead capture.
 */
export async function getWebsiteLeadStatsFromRequest(
  request: Request,
): Promise<WebsiteLeadStats> {
  const rawApiKey = parseIntegrationApiKeyFromRequest(request);

  if (!rawApiKey) {
    throw new AppError("UNAUTHENTICATED", "Invalid or missing API key.");
  }

  const integration = await findActiveWebsiteIntegrationByApiKeyHash(
    hashIntegrationApiKey(rawApiKey),
  );

  if (!integration) {
    throw new AppError("UNAUTHENTICATED", "Invalid or missing API key.");
  }

  const totalLeads = await countActiveLeadsForWorkspace(integration.workspaceId);

  return {
    totalLeads,
    workspaceId: integration.workspaceId,
  };
}
