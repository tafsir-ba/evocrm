import { handleRouteError, successResponse } from "@/server/api/responses";
import { generateDocumentSignedUrlForWorkspace } from "@/server/services/documents";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; documentId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, documentId } = await context.params;
    const { userId, workspace, membership } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "document:read",
    );

    const signedUrl = await generateDocumentSignedUrlForWorkspace(
      workspace.id,
      userId,
      documentId,
      membership.permissions,
    );

    return successResponse(signedUrl);
  } catch (error) {
    return handleRouteError(error);
  }
}
