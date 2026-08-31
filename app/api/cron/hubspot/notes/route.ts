import { handleRouteError, successResponse } from "@/server/api/responses";
import { requireCronAuth } from "@/server/security/cron-auth";
import { reconcileHubSpotNotes } from "@/server/services/hubspot-notes-sync";

export async function POST(request: Request) {
  try {
    requireCronAuth(request);

    const url = new URL(request.url);
    const limitParam = url.searchParams.get("limit");
    const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : undefined;
    const limit =
      parsedLimit && Number.isFinite(parsedLimit)
        ? Math.min(Math.max(parsedLimit, 1), 50)
        : 25;

    const summary = await reconcileHubSpotNotes({ limit });

    return successResponse({
      ...summary,
      triggerAutomation: false,
      mutateLeadProject: false,
      mutateLeadStatus: false,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
