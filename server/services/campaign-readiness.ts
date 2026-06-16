import "server-only";

import { AppError } from "@/server/errors";
import { findCampaignSteps } from "@/server/repositories/campaign-steps";
import { findVerifiedSendingDomainById } from "@/server/repositories/sending-domains";
import type { CampaignRecord } from "@/server/repositories/campaigns";
import { validateCampaignHtml } from "@/lib/campaign-email";

export type CampaignReadinessItem = {
  key: string;
  label: string;
  passed: boolean;
  requiredFix?: string;
};

export type CampaignReadinessReport = {
  ready: boolean;
  items: CampaignReadinessItem[];
  requiredFixes: string[];
};

export async function evaluateCampaignReadiness(
  workspaceId: string,
  campaign: CampaignRecord,
): Promise<CampaignReadinessReport> {
  const steps = await findCampaignSteps(workspaceId, campaign.id);
  const activeSteps = steps.filter((step) => step.status !== "paused");

  const items: CampaignReadinessItem[] = [
    {
      key: "campaign_name",
      label: "Campaign name added",
      passed: Boolean(campaign.name.trim()),
      requiredFix: "Add a campaign name.",
    },
    {
      key: "enrollment_rules",
      label: "Enrollment rules configured",
      passed:
        !campaign.autoEnrollmentEnabled ||
        (campaign.enrollmentRules.conditions.length > 0 &&
          campaign.enrollmentTrigger !== "manual_only"),
      requiredFix: "Configure enrollment rules or disable auto-enrollment.",
    },
    {
      key: "sending_domain",
      label: "Verified sending domain selected",
      passed: Boolean(campaign.sendingDomainId),
      requiredFix: "Select a verified sending domain.",
    },
    {
      key: "sender_email",
      label: "Sender email selected",
      passed: Boolean(campaign.senderEmail),
      requiredFix: "Select a sender email.",
    },
    {
      key: "step_count",
      label: "At least one email step exists",
      passed: steps.length > 0,
      requiredFix: "Add at least one email step.",
    },
    {
      key: "steps_ready",
      label: "All active steps marked ready",
      passed:
        activeSteps.length > 0 &&
        activeSteps.every((step) => step.status === "ready" || step.status === "active"),
      requiredFix: "Mark all active email steps as ready.",
    },
    {
      key: "step_subjects",
      label: "All active steps have a subject",
      passed: activeSteps.every((step) => Boolean(step.subject.trim())),
      requiredFix: "Add a subject to every active email step.",
    },
    {
      key: "step_content",
      label: "All active steps have email content",
      passed: activeSteps.every((step) => {
        if (step.contentMode === "html") {
          return Boolean(step.bodyHtml?.trim() || step.body.trim());
        }
        return Boolean(step.body.trim() || step.bodyText?.trim());
      }),
      requiredFix: "Add content to every active email step.",
    },
    {
      key: "unsubscribe",
      label: "Unsubscribe support included",
      passed: activeSteps.every((step) => {
        const content = `${step.body} ${step.bodyHtml ?? ""} ${step.bodyText ?? ""}`;
        return content.includes("{unsubscribe_url}") || /unsubscribe/i.test(content);
      }),
      requiredFix: "Include {unsubscribe_url} in each active email step.",
    },
  ];

  if (campaign.sendingDomainId) {
    const domain = await findVerifiedSendingDomainById(workspaceId, campaign.sendingDomainId);
    items[2] = {
      ...items[2],
      passed: Boolean(domain),
      requiredFix: domain
        ? undefined
        : "Verify your sending domain before launching this campaign.",
    };
  }

  const htmlWarnings = activeSteps.flatMap((step) =>
    step.contentMode === "html" && step.bodyHtml
      ? validateCampaignHtml(step.bodyHtml).filter(
          (warning) =>
            warning.code === "unsafe_tags" ||
            warning.code === "unsafe_javascript",
        )
      : [],
  );

  items.push({
    key: "html_safety",
    label: "No unsafe HTML warnings",
    passed: htmlWarnings.length === 0,
    requiredFix: "Resolve unsafe HTML warnings in email steps.",
  });

  const requiredFixes = items
    .filter((item) => !item.passed && item.requiredFix)
    .map((item) => item.requiredFix as string);

  return {
    ready: requiredFixes.length === 0,
    items,
    requiredFixes,
  };
}

export async function assertCampaignLaunchReady(
  workspaceId: string,
  campaign: CampaignRecord,
): Promise<void> {
  const report = await evaluateCampaignReadiness(workspaceId, campaign);

  if (!report.ready) {
    throw new AppError("VALIDATION_ERROR", "Campaign cannot launch yet.", {
      details: { requiredFixes: report.requiredFixes },
    });
  }
}
