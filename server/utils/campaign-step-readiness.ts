import "server-only";

import { validateCampaignHtml, emailBodyHasUnsubscribe } from "@/lib/campaign-email";
import { AppError } from "@/server/errors";
import type { CampaignStepRecord } from "@/server/repositories/campaign-steps";

function stepHasContent(step: Pick<CampaignStepRecord, "contentMode" | "body" | "bodyHtml" | "bodyText">): boolean {
  if (step.contentMode === "html") {
    return Boolean(step.bodyHtml?.trim() || step.body.trim());
  }

  return Boolean(step.body.trim() || step.bodyText?.trim());
}

function stepHasUnsubscribe(step: Pick<CampaignStepRecord, "body" | "bodyHtml" | "bodyText">): boolean {
  const content = `${step.body} ${step.bodyHtml ?? ""} ${step.bodyText ?? ""}`;
  return emailBodyHasUnsubscribe(content);
}

export function assertCampaignStepReady(step: CampaignStepRecord): void {
  if (!step.subject.trim()) {
    throw new AppError("VALIDATION_ERROR", "Add a subject before marking this email as ready.");
  }

  if (!stepHasContent(step)) {
    throw new AppError("VALIDATION_ERROR", "Add email content before marking this email as ready.");
  }

  if (!stepHasUnsubscribe(step)) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Include {unsubscribe_url} or an unsubscribe link before marking this email as ready.",
    );
  }

  if (step.contentMode === "html" && step.bodyHtml) {
    const unsafe = validateCampaignHtml(step.bodyHtml).filter(
      (warning) =>
        warning.code === "unsafe_tags" ||
        warning.code === "unsafe_javascript",
    );
    if (unsafe.length > 0) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Resolve unsafe HTML warnings before marking this email as ready.",
      );
    }
  }
}
