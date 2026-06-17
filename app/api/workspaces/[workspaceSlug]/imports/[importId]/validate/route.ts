import {
  handleRouteError,
  successResponse,
} from "@/server/api/responses";
import { getImportEntityConfig } from "@/server/imports/get-entity-config";
import { findImportJobById } from "@/server/repositories/import-jobs";
import { validateImportJob } from "@/server/services/imports";
import { parseRequestOrThrow } from "@/server/validation/request";
import { validateImportSchema } from "@/server/validation/imports";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; importId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, importId } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(workspaceSlug);

    const job = await findImportJobById(workspace.id, importId);

    if (!job) {
      const { AppError } = await import("@/server/errors");
      throw new AppError("NOT_FOUND", "Import job not found.");
    }

    const entityConfig = getImportEntityConfig(job.entityType);
    await requireWorkspaceApiAccess(workspaceSlug, entityConfig.requiredPermission);

    const body = await request.json().catch(() => ({}));
    const input = parseRequestOrThrow(validateImportSchema, body);

    const result = await validateImportJob(
      workspace.id,
      importId,
      workspace.defaultCurrency,
      userId,
      input,
    );

    return successResponse({
      job: result.job,
      summary: result.summary,
      issues: result.issues,
      errorRows: result.errorRows,
      warningRows: result.warningRows,
      rowOverrides: result.rowOverrides,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
