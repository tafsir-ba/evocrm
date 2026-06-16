import "server-only";

import { getCampaignStepLaunchIssues } from "@/lib/campaign-step-readiness";
import { AppError } from "@/server/errors";
import type { CampaignStepRecord } from "@/server/repositories/campaign-steps";

export function assertCampaignStepReady(step: CampaignStepRecord): void {
  const issues = getCampaignStepLaunchIssues(step);

  if (issues.length > 0) {
    throw new AppError("VALIDATION_ERROR", issues[0]);
  }
}
