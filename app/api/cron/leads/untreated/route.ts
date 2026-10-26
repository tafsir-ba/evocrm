import { handleRouteError, successResponse } from "@/server/api/responses";
import { AppError } from "@/server/errors";
import { requireCronAuth } from "@/server/security/cron-auth";
import { runLeadUntreatedAutomation } from "@/server/services/lead-untreated-automation";

function parseFlag(value: string | null | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "true" || normalized === "1";
}

function parseIdList(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => /^[a-f0-9]{24}$/i.test(id));
}

/**
 * Allowlist from LEAD_UNTREATED_INCLUDED_PROJECT_IDS. Unset/blank = all projects.
 * A non-blank value with no valid ObjectId fails closed: falling back to "all
 * projects" on a typo would move leads outside the intended scope.
 */
function parseIncludedProjectIds(value: string | undefined): string[] {
  const ids = parseIdList(value);
  if (ids.length === 0 && value?.replace(/,/g, "").trim()) {
    throw new AppError(
      "VALIDATION_ERROR",
      "LEAD_UNTREATED_INCLUDED_PROJECT_IDS is set but contains no valid project ObjectId",
    );
  }
  return ids;
}

export async function POST(request: Request) {
  try {
    requireCronAuth(request);

    const url = new URL(request.url);
    const limitParam = url.searchParams.get("limit");
    const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : undefined;
    const maxUpdatesPerWorkspace =
      parsedLimit && Number.isFinite(parsedLimit)
        ? Math.min(Math.max(parsedLimit, 1), 2000)
        : 500;

    const dryRun =
      parseFlag(url.searchParams.get("dryRun")) ||
      parseFlag(process.env.LEAD_UNTREATED_AUTOMATION_DRY_RUN);

    const summary = await runLeadUntreatedAutomation({
      dryRun,
      maxUpdatesPerWorkspace,
      workspaceIds: parseIdList(url.searchParams.get("workspaceId")),
      includedProjectIds: parseIncludedProjectIds(process.env.LEAD_UNTREATED_INCLUDED_PROJECT_IDS),
      excludedProjectIds: parseIdList(process.env.LEAD_UNTREATED_EXCLUDED_PROJECT_IDS),
    });

    return successResponse({ ...summary, triggerAutomation: false });
  } catch (error) {
    return handleRouteError(error);
  }
}
