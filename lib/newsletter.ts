/** Default hard cap for included newsletter recipients at lock/send time. */
export const DEFAULT_NEWSLETTER_AUDIENCE_LIMIT = 10_000;

/** Campaign kind discriminator for drip vs newsletter. */
export const CAMPAIGN_KINDS = ["drip", "newsletter"] as const;
export type CampaignKind = (typeof CAMPAIGN_KINDS)[number];

/**
 * How newsletters treat contacts with unknown email consent.
 * Default matches EvoCRM send-path behavior: include and flag in review.
 */
export const NEWSLETTER_UNKNOWN_CONSENT_POLICIES = [
  "include_and_flag",
  "require_subscribed",
] as const;
export type NewsletterUnknownConsentPolicy =
  (typeof NEWSLETTER_UNKNOWN_CONSENT_POLICIES)[number];
export const DEFAULT_NEWSLETTER_UNKNOWN_CONSENT_POLICY: NewsletterUnknownConsentPolicy =
  "include_and_flag";
