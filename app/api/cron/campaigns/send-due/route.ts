import { handleRouteError, successResponse } from "@/server/api/responses";
import { AppError } from "@/server/errors";
import { getEnv } from "@/server/env";
import { clampCampaignSendBatchLimit } from "@/lib/campaign-send-limits";
import { sendDueCampaignEmails } from "@/server/services/campaign-sending";

function requireCronAuth(request: Request): void {
  const env = getEnv();

  if (!env.CRON_SECRET) {
    throw new AppError("UNAUTHENTICATED", "Invalid cron authorization.");
  }

  const authHeader = request.headers.get("authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new AppError("UNAUTHENTICATED", "Invalid cron authorization.");
  }

  const token = authHeader.slice("Bearer ".length);

  if (token !== env.CRON_SECRET) {
    throw new AppError("UNAUTHENTICATED", "Invalid cron authorization.");
  }
}

export async function POST(request: Request) {
  try {
    requireCronAuth(request);

    const url = new URL(request.url);
    const limitParam = url.searchParams.get("limit");
    const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : undefined;
    const limit = clampCampaignSendBatchLimit(parsedLimit);

    const summary = await sendDueCampaignEmails(limit);

    return successResponse({ ...summary });
  } catch (error) {
    return handleRouteError(error);
  }
}
