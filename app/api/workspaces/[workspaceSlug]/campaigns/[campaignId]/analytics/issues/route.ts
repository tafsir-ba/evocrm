import {
  buildPaginationMeta,
  handleRouteError,
  paginatedResponse,
} from "@/server/api/responses";
import { AppError } from "@/server/errors";
import {
  listCampaignAnalyticsIssuesForWorkspace,
  resolveCampaignAnalyticsPeriod,
} from "@/server/services/campaign-analytics";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";
import { parseCampaignAnalyticsPeriod } from "@/lib/campaign-analytics";
import type { NewsletterIssueType } from "@/lib/newsletter-engagement-analytics";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; campaignId: string }>;
};

const ISSUE_TYPES = new Set<NewsletterIssueType>([
  "bounced",
  "failed",
  "complained",
  "delayed",
  "skipped",
]);

function parseIssueType(raw: string | null): NewsletterIssueType | undefined {
  if (!raw) return undefined;
  if (ISSUE_TYPES.has(raw as NewsletterIssueType)) {
    return raw as NewsletterIssueType;
  }

  throw new AppError(
    "VALIDATION_ERROR",
    "Query parameter `issueType` must be bounced, failed, complained, delayed, or skipped.",
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
    const period = parseCampaignAnalyticsPeriod(url.searchParams.get("period"));
    const issueType = parseIssueType(url.searchParams.get("issueType"));
    const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, Number.parseInt(url.searchParams.get("pageSize") ?? "25", 10) || 25),
    );

    const resolved = await resolveCampaignAnalyticsPeriod(workspace.id, campaignId, {
      period,
      userId,
    });

    const { issues, total } = await listCampaignAnalyticsIssuesForWorkspace(
      workspace.id,
      campaignId,
      {
        from: resolved.from,
        to: resolved.to,
        page,
        pageSize,
        userId,
        issueType,
      },
    );

    return paginatedResponse(issues, buildPaginationMeta(page, pageSize, total));
  } catch (error) {
    return handleRouteError(error);
  }
}
