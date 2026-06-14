import { handleRouteError, successResponse } from "@/server/api/responses";
import {
  parseRequestOrThrow,
  validateSearchParams,
} from "@/server/validation/request";
import {
  createIntegrationInputSchema,
  integrationListQuerySchema,
} from "@/server/validation/integrations";
import {
  createIntegrationForWorkspace,
  listIntegrationsForWorkspace,
} from "@/server/services/integrations";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug } = await context.params;
    const { workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "settings:read",
    );

    const url = new URL(request.url);
    const queryResult = validateSearchParams(integrationListQuerySchema, url.searchParams);

    if (!queryResult.success) {
      throw queryResult.error;
    }

    const integrations = await listIntegrationsForWorkspace(workspace.id, {
      includeArchived: queryResult.data.includeArchived,
      type: queryResult.data.type,
      status: queryResult.data.status,
    });

    return successResponse({ integrations });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "settings:update",
    );

    const body: unknown = await request.json();
    const input = parseRequestOrThrow(createIntegrationInputSchema, body);

    const result = await createIntegrationForWorkspace(workspace.id, userId, input);

    return successResponse(result, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
