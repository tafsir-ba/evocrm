import {
  handleRouteError,
  successResponse,
} from "@/server/api/responses";
import { parseRequestOrThrow } from "@/server/validation/request";
import { createSendingDomainInputSchema } from "@/server/validation/sending-domains";
import {
  createSendingDomainForWorkspace,
  listSendingDomainsForWorkspace,
} from "@/server/services/sending-domains";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug } = await context.params;
    const { workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "settings:read",
    );

    const domains = await listSendingDomainsForWorkspace(workspace.id);

    return successResponse({ domains });
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
    const input = parseRequestOrThrow(createSendingDomainInputSchema, body);
    const domain = await createSendingDomainForWorkspace(workspace.id, userId, input);

    return successResponse({ domain }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
