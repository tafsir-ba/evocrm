import { handleRouteError, successResponse } from "@/server/api/responses";
import { AppError } from "@/server/errors";
import { parseRequestOrThrow } from "@/server/validation/request";
import { newsletterAudienceImportInputSchema } from "@/server/validation/newsletters";
import { createNewsletterAudienceImportForWorkspace } from "@/server/services/newsletters";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; campaignId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, campaignId } = await context.params;
    const { workspace, userId } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "campaign:update",
    );

    // Also need lead:create for the underlying import.
    await requireWorkspaceApiAccess(workspaceSlug, "lead:create");

    const formData = await request.formData();
    const file = formData.get("file");
    const targetProjectId = String(formData.get("targetProjectId") ?? "");
    const applyTagIdRaw = formData.get("applyTagId");
    const applyTagId =
      typeof applyTagIdRaw === "string" && applyTagIdRaw.trim()
        ? applyTagIdRaw.trim()
        : undefined;

    const input = parseRequestOrThrow(newsletterAudienceImportInputSchema, {
      targetProjectId,
      ...(applyTagId ? { applyTagId } : {}),
    });

    if (!(file instanceof File)) {
      throw new AppError("VALIDATION_ERROR", "A CSV file is required.");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await createNewsletterAudienceImportForWorkspace({
      workspaceId: workspace.id,
      actorId: userId,
      campaignId,
      targetProjectId: input.targetProjectId,
      applyTagId: input.applyTagId,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || "text/csv",
      fileData: buffer,
    });

    return successResponse(result, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
