import {
  handleRouteError,
  successResponse,
} from "@/server/api/responses";
import { AppError } from "@/server/errors";
import { getImportEntityConfig } from "@/server/imports/get-entity-config";
import { findImportJobById } from "@/server/repositories/import-jobs";
import { getImportJobDetails } from "@/server/services/imports";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; importId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, importId } = await context.params;
    const { workspace } = await requireWorkspaceApiAccess(workspaceSlug);

    const job = await findImportJobById(workspace.id, importId);

    if (!job) {
      throw new AppError("NOT_FOUND", "Import job not found.");
    }

    const entityConfig = getImportEntityConfig(job.entityType);
    await requireWorkspaceApiAccess(workspaceSlug, entityConfig.requiredPermission);

    const details = await getImportJobDetails(workspace.id, importId);
    return successResponse(details);
  } catch (error) {
    return handleRouteError(error);
  }
}
