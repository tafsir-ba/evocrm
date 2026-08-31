import { handleRouteError, successResponse } from "@/server/api/responses";
import { requireCronAuth } from "@/server/security/cron-auth";
import { reconcileHubSpotOngoingSync } from "@/server/services/hubspot-ongoing-sync";

export async function POST(request: Request) {
  try {
    requireCronAuth(request);

    const url = new URL(request.url);
    const limitParam = url.searchParams.get("limit");
    const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : undefined;
    const limit =
      parsedLimit && Number.isFinite(parsedLimit)
        ? Math.min(Math.max(parsedLimit, 1), 100)
        : 50;

    const summary = await reconcileHubSpotOngoingSync({ limit });

    return successResponse({
      ...summary,
      triggerAutomation: false,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
