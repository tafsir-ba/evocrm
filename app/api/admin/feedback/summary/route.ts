import { handleRouteError, successResponse } from "@/server/api/responses";
import { requirePlatformAdmin } from "@/server/auth/require-platform-admin";
import { getOpenFeedbackCountForAdmin } from "@/server/services/feedback";

export async function GET() {
  try {
    await requirePlatformAdmin();
    const openCount = await getOpenFeedbackCountForAdmin();
    return successResponse({ openCount });
  } catch (error) {
    return handleRouteError(error);
  }
}
