import {
  handleRouteError,
  successResponse,
} from "@/server/api/responses";
import { parseRequestOrThrow } from "@/server/validation/request";
import { updateSendingDomainInputSchema } from "@/server/validation/sending-domains";
import {
  deleteSendingDomainForWorkspace,
  getSendingDomainForWorkspace,
  refreshSendingDomainForWorkspace,
  updateSendingDomainSettingsForWorkspace,
  verifySendingDomainForWorkspace,
} from "@/server/services/sending-domains";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; domainId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, domainId } = await context.params;
    const { workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "settings:read",
    );

    const domain = await getSendingDomainForWorkspace(workspace.id, domainId);

    return successResponse({ domain });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, domainId } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "settings:update",
    );

    const body: unknown = await request.json();
    const input = parseRequestOrThrow(updateSendingDomainInputSchema, body);
    const domain = await updateSendingDomainSettingsForWorkspace(
      workspace.id,
      userId,
      domainId,
      input,
    );

    return successResponse({ domain });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, domainId } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "settings:update",
    );

    await deleteSendingDomainForWorkspace(workspace.id, userId, domainId);

    return successResponse({ deleted: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
