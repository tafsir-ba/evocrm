/** Shared Growth Copilot / advertising constants (safe for models + server). */

export const AD_PLATFORMS = ["meta", "google", "tiktok"] as const;
export type AdPlatform = (typeof AD_PLATFORMS)[number];

/**
 * Phase 1 Meta Marketing API scopes — read-only only.
 * Never request ads_management, publish, or other write / spend scopes.
 */
export const META_READ_ONLY_SCOPES = ["ads_read", "business_management"] as const;
export type MetaReadOnlyScope = (typeof META_READ_ONLY_SCOPES)[number];

export const CONSENT_CAPTURE_CHANNELS = ["pixel", "form", "server_side"] as const;
export type ConsentCaptureChannel = (typeof CONSENT_CAPTURE_CHANNELS)[number];

export const CONSENT_PURPOSES = [
  "analytics",
  "advertising",
  "conversion_export",
  "customer_match",
] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

export const AD_CONNECTION_STATUSES = [
  "draft",
  "active",
  "needs_reauth",
  "paused",
  "error",
  "archived",
] as const;

export const AD_ACCOUNT_STATUSES = ["active", "disabled", "unknown", "archived"] as const;

export const GROWTH_CAMPAIGN_STATUSES = [
  "draft",
  "active",
  "paused",
  "completed",
  "archived",
] as const;

export const CONVERSION_MILESTONES = [
  "form_lead",
  "qualified_lead",
  "opportunity_created",
  "won",
  "lost",
] as const;

export const CONVERSION_EXPORT_STATUSES = [
  "not_eligible",
  "blocked_missing_consent",
  "pending",
  "exported",
  "failed",
] as const;

export const ATTRIBUTION_MODELS = [
  "last_touch",
  "first_touch",
  "weighted",
  "platform_reported",
] as const;
