import "server-only";

/**
 * Defensive sender resolution for send-time only.
 * API create/update requires a non-empty step fromName; this fallback covers legacy DB rows.
 */
export function resolveCampaignStepFromName(
  stepFromName: string,
  campaign: { defaultFromName: string | null; name: string },
): string {
  const trimmedStepFromName = stepFromName.trim();

  if (trimmedStepFromName.length > 0) {
    return trimmedStepFromName;
  }

  const defaultFromName = campaign.defaultFromName?.trim();

  if (defaultFromName) {
    return defaultFromName;
  }

  return campaign.name.trim();
}
