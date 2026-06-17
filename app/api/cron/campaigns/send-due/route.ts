import { handleRouteError, successResponse } from "@/server/api/responses";
import { AppError } from "@/server/errors";
import { getEnv } from "@/server/env";
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

    // #region agent log
    fetch('http://127.0.0.1:7314/ingest/a60a918e-508d-4ff1-8e6b-6228f097e67c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6942f7'},body:JSON.stringify({sessionId:'6942f7',location:'send-due/route.ts:POST',message:'send-due endpoint hit',data:{hypothesisId:'H2',at:new Date().toISOString()},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    const url = new URL(request.url);
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 50, 1), 200) : 50;

    const summary = await sendDueCampaignEmails(limit);

    return successResponse({ ...summary });
  } catch (error) {
    return handleRouteError(error);
  }
}
