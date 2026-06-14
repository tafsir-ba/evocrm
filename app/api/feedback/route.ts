import { handleRouteError, successResponse } from "@/server/api/responses";
import { requireAuth } from "@/server/auth/require-auth";
import { AppError } from "@/server/errors";
import { submitFeedbackForUser } from "@/server/services/feedback";
import { feedbackSubmitFieldsSchema } from "@/server/validation/feedback";

export async function POST(request: Request) {
  try {
    const session = await requireAuth();
    const formData = await request.formData();

    const fieldsResult = feedbackSubmitFieldsSchema.safeParse({
      category: formData.get("category")?.toString() ?? "bug",
      body: formData.get("body")?.toString(),
      pageUrl: formData.get("page_url")?.toString(),
      userAgent: formData.get("user_agent")?.toString(),
      projectId: formData.get("project_id")?.toString(),
      workspaceSlug: formData.get("workspace_slug")?.toString(),
    });

    if (!fieldsResult.success) {
      throw new AppError("VALIDATION_ERROR", "Invalid feedback submission.", {
        details: fieldsResult.error.flatten(),
      });
    }

    const screenshots = formData
      .getAll("screenshots")
      .filter((entry): entry is File => entry instanceof File && entry.size > 0);

    const result = await submitFeedbackForUser({
      userId: session.user.id,
      userEmail: session.user.email,
      userName: session.user.name,
      fields: fieldsResult.data,
      screenshots,
    });

    return successResponse({ ok: true, id: result.id });
  } catch (error) {
    return handleRouteError(error);
  }
}
