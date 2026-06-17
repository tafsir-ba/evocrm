import {
  handleRouteError,
  successResponse,
} from "@/server/api/responses";
import { validateSearchParams } from "@/server/validation/request";
import { importConfigQuerySchema } from "@/server/validation/imports";
import { getImportConfigForEntity } from "@/server/services/imports";
import { getImportEntityConfig } from "@/server/imports/get-entity-config";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug } = await context.params;
    const url = new URL(request.url);
    const queryResult = validateSearchParams(importConfigQuerySchema, url.searchParams);

    if (!queryResult.success) {
      throw queryResult.error;
    }

    const entityConfig = getImportEntityConfig(queryResult.data.entityType);
    await requireWorkspaceApiAccess(workspaceSlug, entityConfig.requiredPermission);

    return successResponse(getImportConfigForEntity(queryResult.data.entityType));
  } catch (error) {
    return handleRouteError(error);
  }
}
