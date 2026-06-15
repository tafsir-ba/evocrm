import { handleRouteError, successResponse } from "@/server/api/responses";
import { requirePlatformAdmin } from "@/server/auth/require-platform-admin";
import { AppError } from "@/server/errors";
import {
  deleteFeedbackForAdmin,
  getFeedbackDetailForAdmin,
  updateFeedbackStatusForAdmin,
} from "@/server/services/feedback";
import { parseRequestOrThrow } from "@/server/validation/request";
import { feedbackStatusUpdateSchema } from "@/server/validation/feedback";

type RouteContext = {
  params: Promise<{ feedbackId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await requirePlatformAdmin();
    const { feedbackId } = await context.params;
    const body = parseRequestOrThrow(feedbackStatusUpdateSchema, await request.json());

    const updated = await updateFeedbackStatusForAdmin({
      feedbackId,
      status: body.status,
      adminUserId: session.user.id,
      notifyEmail: body.notifyEmail,
    });

    if (!updated) {
      throw new AppError("NOT_FOUND", "Feedback not found.");
    }

    return successResponse(updated);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const session = await requirePlatformAdmin();
    const { feedbackId } = await context.params;

    const deleted = await deleteFeedbackForAdmin({
      feedbackId,
      adminUserId: session.user.id,
    });

    if (!deleted) {
      throw new AppError("NOT_FOUND", "Feedback not found.");
    }

    return successResponse({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    await requirePlatformAdmin();
    const { feedbackId } = await context.params;

    const detail = await getFeedbackDetailForAdmin(feedbackId);

    if (!detail) {
      throw new AppError("NOT_FOUND", "Feedback not found.");
    }

    return successResponse(detail);
  } catch (error) {
    return handleRouteError(error);
  }
}
