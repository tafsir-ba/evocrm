import "server-only";

import { META_READ_ONLY_SCOPES } from "@/lib/advertising-constants";

/**
 * Recommended defaults adopted for Growth Copilot (brief §13).
 * Silent product-owner = proceed on these unless overridden before the named phase.
 */
export const ADVERTISING_DEFAULTS = {
  /**
   * Phase 1 pilot — confirmed by product owner 2026-10-01.
   * Project is resolved by reference in the workspace (not a hard-coded ObjectId).
   */
  pilotSelection: {
    strategy: "one_live_project_single_country_with_meta_spend" as const,
    projectName: "Satigny duplex",
    projectReference: "satigny_duplex",
    countryCode: "CH",
    marketLabel: "Geneva, Switzerland",
    namedInPhase0: true,
    confirmedAt: "2026-10-01",
  },
  /** Phase 1 */
  readPilotPlatforms: ["meta"] as const,
  /** Meta Marketing API read-only scopes for Phase 1 — never request write scopes. */
  metaReadOnlyScopes: META_READ_ONLY_SCOPES,
  /** Phase 2 */
  attributionPolicyV1: "last_touch" as const,
  attributionLabelRequired: true,
  keepRawTouchpoints: true,
  /**
   * Phase 2 — Satigny: adopt seeded dictionary key (not a hard-coded ObjectId).
   * Resolve via findDictionaryItemByTypeAndKey(workspaceId, "lead_status", "qualified").
   */
  qualifiedLeadDefinition: {
    strategy: "explicit_lifecycle_status_or_tag" as const,
    statusKey: "qualified" as const,
    statusId: null as string | null,
    tagKey: null as string | null,
  },
  /** Phase 3–4 */
  spendChangeApproval: {
    increasesRequireHumanApproval: true,
    decreaseOrPauseWithinGuardrailsOnly: true,
  },
  /** Phase 4 */
  maxAutomatedBudgetAdjustment: {
    percentOfDailyBudget: 10,
    maxOncePerHours: 24,
    per: "campaign" as const,
  },
  /** Pre-build / Phase 3 */
  mediaStorage: {
    provider: "digitalocean_spaces" as const,
    asyncRenditions: true,
    raiseAdAssetLimitIndependentlyOfDocument25Mb: true,
  },
  /** Phase 2 */
  consent: {
    storeOnTouchpointAtCapture: true,
    blockExportWithoutConsent: true,
    blockCustomerMatchWithoutConsent: true,
    marketsFirst: ["CH", "EU"] as const,
    captureChannels: ["pixel", "form", "server_side"] as const,
  },
  successMetricHierarchy: [
    "won_value_roas_payback",
    "opportunities_pipeline_value",
    "qualified_leads_cpql",
    "form_leads_cpl_diagnostic",
    "clicks_cpc_ctr_cpm_media_only",
  ] as const,
} as const;

export type AdvertisingDefaults = typeof ADVERTISING_DEFAULTS;
