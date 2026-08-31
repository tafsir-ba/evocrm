import { handleRouteError, successResponse } from "@/server/api/responses";
import {
  getLeadEnrichmentWorkspaceSettings,
  updateLeadEnrichmentWorkspaceSettings,
} from "@/server/services/lead-enrichment";
import { parseRequestOrThrow } from "@/server/validation/request";
import { updateLeadEnrichmentSettingsSchema } from "@/server/validation/lead-enrichment";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug } = await context.params;
    const { workspace } = await requireWorkspaceApiAccess(workspaceSlug, "settings:read");
    const settings = await getLeadEnrichmentWorkspaceSettings(workspace.id);
    return successResponse({ settings });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug } = await context.params;
    const { workspace, userId } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "settings:update",
    );
    const input = parseRequestOrThrow(
      updateLeadEnrichmentSettingsSchema,
      await request.json(),
    );
    const settings = await updateLeadEnrichmentWorkspaceSettings({
      workspaceId: workspace.id,
      actorId: userId,
      ...input,
    });
    return successResponse({ settings });
  } catch (error) {
    return handleRouteError(error);
  }
}
