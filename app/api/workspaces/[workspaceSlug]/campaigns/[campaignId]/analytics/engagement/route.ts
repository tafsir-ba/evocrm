import { NextResponse } from "next/server";

import {
  buildPaginationMeta,
  handleRouteError,
} from "@/server/api/responses";
import { AppError } from "@/server/errors";
import { listCampaignAnalyticsEngagementForWorkspace } from "@/server/services/campaign-analytics";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; campaignId: string }>;
};

function parsePartition(
  raw: string | null,
): "opened" | "not_opened" {
  if (raw === "opened" || raw === "not_opened") {
    return raw;
  }

  throw new AppError(
    "VALIDATION_ERROR",
    "Query parameter `partition` must be `opened` or `not_opened`.",
  );
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, campaignId } = await context.params;
    const { workspace, userId } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "campaign:read",
    );

    const url = new URL(request.url);
    const partition = parsePartition(url.searchParams.get("partition"));
    const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, Number.parseInt(url.searchParams.get("pageSize") ?? "25", 10) || 25),
    );

    const { recipients, total, notOpenedBasis } =
      await listCampaignAnalyticsEngagementForWorkspace(workspace.id, campaignId, {
        partition,
        page,
        pageSize,
        userId,
      });

    return NextResponse.json({
      data: recipients,
      pagination: buildPaginationMeta(page, pageSize, total),
      meta: {
        partition,
        notOpenedBasis,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
