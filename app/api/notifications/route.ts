import { handleRouteError, successResponse } from "@/server/api/responses";
import { requireAuth } from "@/server/auth/require-auth";
import {
  listNotificationsForCurrentUser,
  markAllNotificationsReadForCurrentUser,
} from "@/server/services/notifications";

export async function GET(request: Request) {
  try {
    const session = await requireAuth();
    const url = new URL(request.url);
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? Number(limitParam) : undefined;

    const result = await listNotificationsForCurrentUser({
      userId: session.user.id,
      limit: Number.isFinite(limit) ? limit : undefined,
    });

    return successResponse(result);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH() {
  try {
    const session = await requireAuth();
    const result = await markAllNotificationsReadForCurrentUser(session.user.id);
    return successResponse(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
