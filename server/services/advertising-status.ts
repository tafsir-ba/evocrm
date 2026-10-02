import "server-only";

import { isAdvertisingEnabled } from "@/lib/advertising-feature";
import { ADVERTISING_DEFAULTS } from "@/server/advertising/defaults";
import { ADVERTISING_JOB_CONVENTIONS } from "@/server/advertising/jobs/conventions";
import {
  ADVERTISING_APPROVAL_SUBJECTS,
  ADVERTISING_HUMAN_APPROVAL_REQUIRED,
} from "@/server/advertising/approvals";
import { assertAdvertisingEnabled } from "@/server/features/advertising";

/**
 * Foundation status for Growth Copilot advertising module.
 * Plain-language fields for non-technical operators when UI lands.
 */
export type AdvertisingModuleStatus = {
  enabled: boolean;
  /** Kids-friendly summary for operators. */
  summary: string;
  nextStepHint: string;
  defaults: {
    readPilotPlatforms: readonly string[];
    attributionPolicyV1: string;
    mediaStorage: string;
    consentMarketsFirst: readonly string[];
    pilotProjectReference: string;
    pilotMarketLabel: string;
  };
  approvalSubjectsRequiringHuman: readonly string[];
  jobConventions: {
    retryMaxAttempts: number;
    softStaleAfterMinutes: number;
    hardStaleAfterHours: number;
    defaultWriteScopes: boolean;
  };
  phase0Guarantees: {
    noPlatformNetworkCalls: true;
    hubSpotVaultUnchanged: true;
    growthCampaignSeparateFromEmailDrip: true;
  };
};

export function getAdvertisingModuleStatus(options?: {
  requireEnabled?: boolean;
}): AdvertisingModuleStatus {
  if (options?.requireEnabled) {
    assertAdvertisingEnabled();
  }

  const enabled = isAdvertisingEnabled();

  return {
    enabled,
    summary: enabled
      ? "Paid ads tools are turned on for this workspace."
      : "Paid ads tools are turned off for now.",
    nextStepHint: enabled
      ? "Open Settings → Paid ads to connect Meta for the Satigny duplex pilot (read only)."
      : "Ask a workspace admin to turn on advertising when the Satigny pilot starts.",
    defaults: {
      readPilotPlatforms: ADVERTISING_DEFAULTS.readPilotPlatforms,
      attributionPolicyV1: ADVERTISING_DEFAULTS.attributionPolicyV1,
      mediaStorage: ADVERTISING_DEFAULTS.mediaStorage.provider,
      consentMarketsFirst: ADVERTISING_DEFAULTS.consent.marketsFirst,
      pilotProjectReference: ADVERTISING_DEFAULTS.pilotSelection.projectReference,
      pilotMarketLabel: ADVERTISING_DEFAULTS.pilotSelection.marketLabel,
    },
    approvalSubjectsRequiringHuman: ADVERTISING_HUMAN_APPROVAL_REQUIRED,
    jobConventions: {
      retryMaxAttempts: ADVERTISING_JOB_CONVENTIONS.retryMaxAttempts,
      softStaleAfterMinutes:
        ADVERTISING_JOB_CONVENTIONS.syncFreshness.softStaleAfterMs / 60_000,
      hardStaleAfterHours:
        ADVERTISING_JOB_CONVENTIONS.syncFreshness.hardStaleAfterMs / 3_600_000,
      defaultWriteScopes: ADVERTISING_JOB_CONVENTIONS.defaultWriteScopes,
    },
    phase0Guarantees: {
      noPlatformNetworkCalls: true,
      hubSpotVaultUnchanged: true,
      growthCampaignSeparateFromEmailDrip: true,
    },
  };
}

/** Approval vocabulary size — used in status smoke tests. */
export function countAdvertisingApprovalSubjects(): number {
  return ADVERTISING_APPROVAL_SUBJECTS.length;
}
