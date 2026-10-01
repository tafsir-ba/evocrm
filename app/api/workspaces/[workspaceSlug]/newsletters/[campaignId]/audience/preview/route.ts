import { handleRouteError, successResponse } from "@/server/api/responses";
import {
  exportNewsletterAudienceExclusionsCsvForWorkspace,
  previewNewsletterAudienceForWorkspace,
} from "@/server/services/newsletters";
import { newsletterAudiencePreviewQuerySchema } from "@/server/validation/newsletters";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; campaignId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, campaignId } = await context.params;
    const { workspace, userId } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "campaign:read",
    );

    const url = new URL(request.url);
    const query = newsletterAudiencePreviewQuerySchema.parse({
      exclusionPage: url.searchParams.get("exclusionPage") ?? undefined,
      exclusionPageSize: url.searchParams.get("exclusionPageSize") ?? undefined,
      export: url.searchParams.get("export") ?? undefined,
    });

    if (query.export === "exclusions") {
      const csv = await exportNewsletterAudienceExclusionsCsvForWorkspace(
        workspace.id,
        campaignId,
        userId,
      );
      return new Response(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="newsletter-${campaignId}-exclusions.csv"`,
        },
      });
    }

    const preview = await previewNewsletterAudienceForWorkspace(
      workspace.id,
      campaignId,
      userId,
      {
        exclusionPage: query.exclusionPage,
        exclusionPageSize: query.exclusionPageSize,
      },
    );

    return successResponse({ preview });
  } catch (error) {
    return handleRouteError(error);
  }
}
