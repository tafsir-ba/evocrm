import { NextResponse } from "next/server";

import { handleRouteError } from "@/server/api/responses";
import { requirePlatformAdmin } from "@/server/auth/require-platform-admin";
import { AppError } from "@/server/errors";
import { getFeedbackScreenshotForAdmin } from "@/server/services/feedback";

type RouteContext = {
  params: Promise<{ feedbackId: string; index: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    await requirePlatformAdmin();
    const { feedbackId, index } = await context.params;
    const screenshotIndex = Number.parseInt(index, 10);

    if (!Number.isInteger(screenshotIndex) || screenshotIndex < 0) {
      throw new AppError("VALIDATION_ERROR", "Invalid screenshot index.");
    }

    const screenshot = await getFeedbackScreenshotForAdmin({
      feedbackId,
      index: screenshotIndex,
    });

    if (!screenshot) {
      throw new AppError("NOT_FOUND", "Screenshot not found.");
    }

    return new NextResponse(new Uint8Array(screenshot.body), {
      status: 200,
      headers: {
        "Content-Type": screenshot.contentType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(screenshot.filename)}"`,
        "Cache-Control": "private, max-age=604800, immutable",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
