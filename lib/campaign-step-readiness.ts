import { emailBodyHasUnsubscribe, validateCampaignHtml } from "@/lib/campaign-email";

export type CampaignStepLaunchFields = {
  status: string;
  subject: string;
  contentMode: string;
  body: string;
  bodyHtml: string | null;
  bodyText: string | null;
};

function stepHasContent(step: Pick<CampaignStepLaunchFields, "contentMode" | "body" | "bodyHtml" | "bodyText">): boolean {
  if (step.contentMode === "html") {
    return Boolean(step.bodyHtml?.trim() || step.body.trim());
  }

  return Boolean(step.body.trim() || step.bodyText?.trim());
}

function stepHasUnsubscribe(step: Pick<CampaignStepLaunchFields, "body" | "bodyHtml" | "bodyText">): boolean {
  const content = `${step.body} ${step.bodyHtml ?? ""} ${step.bodyText ?? ""}`;
  return emailBodyHasUnsubscribe(content);
}

export function getCampaignStepLaunchIssues(step: CampaignStepLaunchFields): string[] {
  const issues: string[] = [];

  if (!step.subject.trim()) {
    issues.push("Add a subject before marking this email as ready.");
  }

  if (!stepHasContent(step)) {
    issues.push("Add email content before marking this email as ready.");
  }

  if (!stepHasUnsubscribe(step)) {
    issues.push("Include {unsubscribe_url} or an unsubscribe link before marking this email as ready.");
  }

  if (step.contentMode === "html" && step.bodyHtml) {
    const unsafe = validateCampaignHtml(step.bodyHtml).filter(
      (warning) =>
        warning.code === "unsafe_tags" ||
        warning.code === "unsafe_javascript",
    );

    if (unsafe.length > 0) {
      issues.push("Resolve unsafe HTML warnings before marking this email as ready.");
    }
  }

  return issues;
}

export function isCampaignStepLaunchReady(step: CampaignStepLaunchFields): boolean {
  if (step.status !== "ready" && step.status !== "active") {
    return false;
  }

  return getCampaignStepLaunchIssues(step).length === 0;
}
