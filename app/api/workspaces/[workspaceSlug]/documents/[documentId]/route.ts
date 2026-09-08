import { handleRouteError, successResponse } from "@/server/api/responses";
import {
  archiveDocumentForWorkspace,
  getDocumentForWorkspace,
} from "@/server/services/documents";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; documentId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, documentId } = await context.params;
    const { workspace, permissions } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "document:read",
    );

    const document = await getDocumentForWorkspace(
      workspace.id,
      documentId,
      permissions,
    );

    return successResponse({ document });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, documentId } = await context.params;
    const { userId, workspace, permissions } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "document:archive",
    );

    const document = await archiveDocumentForWorkspace(
      workspace.id,
      userId,
      documentId,
      permissions,
    );

    return successResponse({ document });
  } catch (error) {
    return handleRouteError(error);
  }
}
