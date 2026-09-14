import { handleRouteError, successResponse } from "@/server/api/responses";
import { parseIntegrationApiKeyFromRequest } from "@/server/services/integration-api-keys";
import { getWebsiteLeadStatsFromRequest } from "@/server/services/website-lead-stats";
import { assertWebsiteLeadRateLimit } from "@/server/security/website-lead-rate-limit";

export async function GET(request: Request) {
  try {
    const rawApiKey = parseIntegrationApiKeyFromRequest(request);

    await assertWebsiteLeadRateLimit(request, rawApiKey);

    const stats = await getWebsiteLeadStatsFromRequest(request);

    return successResponse({
      totalLeads: stats.totalLeads,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
