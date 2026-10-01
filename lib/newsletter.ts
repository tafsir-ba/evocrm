/** Default hard cap for included newsletter recipients at lock/send time. */
export const DEFAULT_NEWSLETTER_AUDIENCE_LIMIT = 10_000;

/** Campaign kind discriminator for drip vs newsletter. */
export const CAMPAIGN_KINDS = ["drip", "newsletter"] as const;
export type CampaignKind = (typeof CAMPAIGN_KINDS)[number];
