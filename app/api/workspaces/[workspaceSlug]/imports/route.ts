import {
  handleRouteError,
  successResponse,
} from "@/server/api/responses";
import { isImportEntityType } from "@/lib/imports";
import { AppError } from "@/server/errors";
import { getImportEntityConfig } from "@/server/imports/get-entity-config";
import { createImportJobForWorkspace } from "@/server/services/imports";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug } = await context.params;
    const formData = await request.formData();
    const entityTypeValue = String(formData.get("entityType") ?? "");
    const file = formData.get("file");

    if (!isImportEntityType(entityTypeValue)) {
      throw new AppError("VALIDATION_ERROR", "A valid entity type is required.");
    }

    const entityConfig = getImportEntityConfig(entityTypeValue);
    const { userId, workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      entityConfig.requiredPermission,
    );

    if (!(file instanceof File)) {
      throw new AppError("VALIDATION_ERROR", "A file is required.");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await createImportJobForWorkspace({
      workspaceId: workspace.id,
      actorId: userId,
      entityType: entityTypeValue,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || "application/octet-stream",
      fileData: buffer,
    });

    return successResponse(result, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
