import { handleRouteError, successResponse } from "@/server/api/responses";
import { parseRequestOrThrow } from "@/server/validation/request";
import { testCampaignStepEmailInputSchema } from "@/server/validation/campaign-steps";
import { findCampaignStepById } from "@/server/repositories/campaign-steps";
import { findCampaignById } from "@/server/repositories/campaigns";
import { buildCampaignEmailHtml, sendCampaignEmail } from "@/server/email/resend";
import { resolveCampaignStepFromName } from "@/server/utils/campaign-from-name";
import { assertVerifiedSenderEmail } from "@/server/services/sending-domains";
import { applyCampaignVariables, CAMPAIGN_EMAIL_PREVIEW_CONTEXT } from "@/lib/campaign-email";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";
import { AppError } from "@/server/errors";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; campaignId: string; stepId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, campaignId, stepId } = await context.params;
    const { workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "campaign:update",
    );

    const body: unknown = await request.json();
    const input = parseRequestOrThrow(testCampaignStepEmailInputSchema, body);

    const campaign = await findCampaignById(workspace.id, campaignId);
    if (!campaign) {
      throw new AppError("NOT_FOUND", "Campaign not found.");
    }

    const step = await findCampaignStepById(workspace.id, campaignId, stepId);
    if (!step) {
      throw new AppError("NOT_FOUND", "Campaign step not found.");
    }

    const fromName = resolveCampaignStepFromName(step.fromName, campaign);

    if (!campaign.sendingDomainId || !campaign.senderEmail) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Configure a verified sending domain and sender email before sending a test email.",
      );
    }

    await assertVerifiedSenderEmail(workspace.id, campaign.sendingDomainId, campaign.senderEmail);

    const previewUrl = "#";
    const previewContext = {
      ...CAMPAIGN_EMAIL_PREVIEW_CONTEXT,
      unsubscribeUrl: previewUrl,
    };
    const resolvedBody = applyCampaignVariables(step.body, previewContext);
    const resolvedHtml = step.bodyHtml
      ? applyCampaignVariables(step.bodyHtml, previewContext)
      : null;
    const html = buildCampaignEmailHtml(resolvedBody, previewUrl, {
      htmlBody: resolvedHtml,
      previewText: step.previewText,
    });

    const result = await sendCampaignEmail({
      to: input.to,
      subject: `[Test] ${step.subject || step.name || "Campaign email"}`,
      html,
      text: step.bodyText ?? resolvedBody,
      fromName,
      fromEmail: campaign.senderEmail,
      tags: [
        { name: "workspace_id", value: workspace.id },
        { name: "campaign_id", value: campaignId },
        { name: "campaign_step_id", value: stepId },
      ],
    });

    if (!result.success) {
      throw new AppError("VALIDATION_ERROR", "Could not send the test email.");
    }

    return successResponse({ sent: true, messageId: result.messageId });
  } catch (error) {
    return handleRouteError(error);
  }
}
