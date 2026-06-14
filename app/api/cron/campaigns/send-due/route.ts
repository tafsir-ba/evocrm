import { handleRouteError, successResponse } from "@/server/api/responses";
import { AppError } from "@/server/errors";
import { getEnv } from "@/server/env";
import { sendDueCampaignEmails } from "@/server/services/campaign-sending";

function requireCronAuth(request: Request): void {
  const env = getEnv();

  if (!env.CRON_SECRET) {
    throw new AppError("INTERNAL_ERROR", "Cron is not configured.", { expose: false });
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
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 50, 1), 200) : 50;

    const summary = await sendDueCampaignEmails(limit);

    return successResponse({ ...summary });
  } catch (error) {
    return handleRouteError(error);
  }
}
