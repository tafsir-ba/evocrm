import { handleRouteError, successResponse } from "@/server/api/responses";
import { assertAdvertisingEnabled } from "@/server/features/advertising";
import { getAdvertisingModuleStatus } from "@/server/services/advertising-status";
import { requireWorkspaceMemberApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string }>;
};

/**
 * Growth Copilot module status (Phase 0).
 * Requires advertising:read. Feature flag must be on — otherwise CONFLICT.
 * No platform network calls.
 */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug } = await context.params;
    await requireWorkspaceMemberApiAccess(workspaceSlug, "advertising:read");
    assertAdvertisingEnabled();

    return successResponse({
      advertising: getAdvertisingModuleStatus(),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
