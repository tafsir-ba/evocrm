import { handleRouteError, successResponse } from "@/server/api/responses";
import {
  connectMetaForWorkspace,
  listAdvertisingConnectionsForWorkspace,
} from "@/server/services/advertising-meta-sync";
import { parseRequestOrThrow } from "@/server/validation/request";
import { connectMetaInputSchema } from "@/server/validation/advertising";
import { requireWorkspaceMemberApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug } = await context.params;
    const { workspace } = await requireWorkspaceMemberApiAccess(
      workspaceSlug,
      "advertising:read",
    );
    const result = await listAdvertisingConnectionsForWorkspace(workspace.id);
    return successResponse(result);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug } = await context.params;
    const { userId, workspace } = await requireWorkspaceMemberApiAccess(
      workspaceSlug,
      "advertising:connect",
    );
    const body: unknown = await request.json();
    const input = parseRequestOrThrow(connectMetaInputSchema, body);
    const result = await connectMetaForWorkspace({
      workspaceId: workspace.id,
      actorId: userId,
      name: input.name,
      accessToken: input.accessToken,
      businessId: input.businessId,
      useFixture: input.useFixture,
    });
    return successResponse(result, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
