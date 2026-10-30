import { handleRouteError, successResponse } from "@/server/api/responses";
import type { LeadFunnelDateRange } from "@/lib/lead-funnel-metrics";
import { requireProjectAccess } from "@/server/permissions/require-project-access";
import { getProjectLeadFunnel } from "@/server/services/lead-funnel";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; projectId: string }>;
};

function parseRange(value: string | null): LeadFunnelDateRange {
  if (value === "30d" || value === "90d" || value === "all") {
    return value;
  }
  return "all";
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, projectId } = await context.params;
    const { workspace, userId } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "lead:read",
    );

    await requireProjectAccess(workspace.id, userId, projectId, "project:read");

    const url = new URL(request.url);
    const range = parseRange(url.searchParams.get("range"));

    const data = await getProjectLeadFunnel({
      workspaceId: workspace.id,
      projectId,
      range,
    });

    return successResponse(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
