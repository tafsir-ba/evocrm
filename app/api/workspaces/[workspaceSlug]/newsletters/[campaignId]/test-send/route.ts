import { handleRouteError, successResponse } from "@/server/api/responses";
import { AppError } from "@/server/errors";
import {
  formatNewsletterTestEmailErrors,
  parseNewsletterTestEmails,
} from "@/lib/newsletter-test-emails";
import { parseRequestOrThrow } from "@/server/validation/request";
import { newsletterTestSendInputSchema } from "@/server/validation/newsletters";
import { sendNewsletterTestEmailsForWorkspace } from "@/server/services/newsletters";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; campaignId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, campaignId } = await context.params;
    const { workspace, userId } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "campaign:update",
    );

    const body: unknown = await request.json();
    const input = parseRequestOrThrow(newsletterTestSendInputSchema, body);
    const parsed = parseNewsletterTestEmails(
      Array.isArray(input.emails) ? input.emails.join("\n") : input.emails,
    );
    const emailError = formatNewsletterTestEmailErrors(parsed);
    if (emailError) {
      throw new AppError("VALIDATION_ERROR", emailError, {
        details: {
          invalid: parsed.invalid,
          emails: parsed.emails,
        },
      });
    }

    const result = await sendNewsletterTestEmailsForWorkspace(
      workspace.id,
      userId,
      campaignId,
      parsed.emails,
    );

    return successResponse(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
