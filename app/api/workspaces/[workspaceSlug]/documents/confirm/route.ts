import { handleRouteError, successResponse } from "@/server/api/responses";
import { confirmDocumentUploadForWorkspace } from "@/server/services/documents";
import { documentConfirmInputSchema } from "@/server/validation/documents";
import { parseRequestOrThrow } from "@/server/validation/request";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug } = await context.params;
    const { userId, workspace, membership } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "document:create",
    );

    const body: unknown = await request.json();
    const input = parseRequestOrThrow(documentConfirmInputSchema, body);

    const document = await confirmDocumentUploadForWorkspace(
      workspace.id,
      userId,
      membership.permissions,
      input,
    );

    return successResponse({ document }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
