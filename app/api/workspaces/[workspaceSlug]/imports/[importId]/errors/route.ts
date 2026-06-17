import { NextResponse } from "next/server";

import { handleRouteError } from "@/server/api/responses";
import { getImportEntityConfig } from "@/server/imports/get-entity-config";
import { findImportJobById } from "@/server/repositories/import-jobs";
import { getImportErrorCsv } from "@/server/services/imports";
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
      const { AppError } = await import("@/server/errors");
      throw new AppError("NOT_FOUND", "Import job not found.");
    }

    const entityConfig = getImportEntityConfig(job.entityType);
    await requireWorkspaceApiAccess(workspaceSlug, entityConfig.requiredPermission);

    const csv = await getImportErrorCsv(workspace.id, importId);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="import-errors-${importId}.csv"`,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
