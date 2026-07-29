/**
 * Resolve the From / contact name shown in recipients' inboxes.
 * Prefer an explicit step override, then campaign sender settings.
 * Campaign name is a last-resort fallback for legacy rows only.
 */
export function resolveCampaignStepFromName(
  stepFromName: string | null | undefined,
  campaign: {
    senderName?: string | null;
    defaultFromName: string | null;
    name: string;
  },
): string {
  const trimmedStepFromName = stepFromName?.trim() ?? "";

  if (trimmedStepFromName.length > 0) {
    return trimmedStepFromName;
  }

  const senderName = campaign.senderName?.trim();
  if (senderName) {
    return senderName;
  }

  const defaultFromName = campaign.defaultFromName?.trim();

  if (defaultFromName) {
    return defaultFromName;
  }

  return campaign.name.trim();
}

/** True when the campaign has an explicit contact/from name (not just the campaign title). */
export function campaignHasSenderContactName(campaign: {
  senderName?: string | null;
  defaultFromName?: string | null;
}): boolean {
  return Boolean(campaign.senderName?.trim() || campaign.defaultFromName?.trim());
}
