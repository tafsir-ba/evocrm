import { handleRouteError, successResponse } from "@/server/api/responses";
import { requireAuth } from "@/server/auth/require-auth";
import { AppError } from "@/server/errors";
import { markNotificationReadForCurrentUser } from "@/server/services/notifications";
import { objectIdSchema } from "@/server/validation/common";
import { parseRequestOrThrow } from "@/server/validation/request";
import { z } from "zod";

const markReadSchema = z.object({
  read: z.literal(true),
});

type RouteContext = {
  params: Promise<{ notificationId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await requireAuth();
    const { notificationId: rawNotificationId } = await context.params;
    const notificationId = parseRequestOrThrow(objectIdSchema, rawNotificationId);
    parseRequestOrThrow(markReadSchema, await request.json());

    const updated = await markNotificationReadForCurrentUser({
      userId: session.user.id,
      notificationId,
    });

    if (!updated) {
      throw new AppError("NOT_FOUND", "Notification not found.");
    }

    return successResponse(updated);
  } catch (error) {
    return handleRouteError(error);
  }
}
