import { handleRouteError, successResponse } from "@/server/api/responses";
import { requirePlatformAdmin } from "@/server/auth/require-platform-admin";
import { listFeedbackForAdmin } from "@/server/services/feedback";
import { validateSearchParams } from "@/server/validation/request";
import { feedbackListQuerySchema } from "@/server/validation/feedback";

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin();

    const url = new URL(request.url);
    const queryResult = validateSearchParams(feedbackListQuerySchema, url.searchParams);

    if (!queryResult.success) {
      throw queryResult.error;
    }

    const result = await listFeedbackForAdmin(queryResult.data);

    return successResponse({
      items: result.items,
      total: result.total,
      summary: result.summary,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
