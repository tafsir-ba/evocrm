/**
 * Resolve the From / contact name shown in recipients' inboxes.
 * Prefer an explicit step override, then campaign sender settings.
 * Never use the campaign title — that produced long internal names in inboxes.
 * A step fromName equal to the campaign name is treated as unset (legacy bake).
 */
export function resolveCampaignStepFromName(
  stepFromName: string | null | undefined,
  campaign: {
    senderName?: string | null;
    defaultFromName: string | null;
    name: string;
  },
): string {
  const campaignTitle = campaign.name.trim();
  const trimmedStepFromName = stepFromName?.trim() ?? "";

  if (trimmedStepFromName.length > 0 && trimmedStepFromName !== campaignTitle) {
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

  return "";
}

/** True when the campaign has an explicit contact/from name (not just the campaign title). */
export function campaignHasSenderContactName(campaign: {
  senderName?: string | null;
  defaultFromName?: string | null;
}): boolean {
  return Boolean(campaign.senderName?.trim() || campaign.defaultFromName?.trim());
}
