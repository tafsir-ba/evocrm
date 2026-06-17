import {
  handleRouteError,
  successResponse,
} from "@/server/api/responses";
import { parseRequestOrThrow } from "@/server/validation/request";
import { parseImportSchema } from "@/server/validation/imports";
import { getImportEntityConfig } from "@/server/imports/get-entity-config";
import { findImportJobById } from "@/server/repositories/import-jobs";
import { parseImportJobFile } from "@/server/services/imports";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; importId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, importId } = await context.params;
    const { workspace } = await requireWorkspaceApiAccess(workspaceSlug);

    const body: unknown = await request.json().catch(() => ({}));
    const input = parseRequestOrThrow(parseImportSchema, body);

    const job = await findImportJobById(workspace.id, importId);

    if (!job) {
      const { AppError } = await import("@/server/errors");
      throw new AppError("NOT_FOUND", "Import job not found.");
    }

    const entityConfig = getImportEntityConfig(job.entityType);
    await requireWorkspaceApiAccess(workspaceSlug, entityConfig.requiredPermission);

    const result = await parseImportJobFile(job, input);
    return successResponse(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
