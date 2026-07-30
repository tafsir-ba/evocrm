/**
 * RFC 8058 one-click unsubscribe headers for marketing / drip emails.
 * The URL must accept HTTP POST with body `List-Unsubscribe=One-Click`.
 */
export function buildCampaignListUnsubscribeHeaders(
  oneClickUnsubscribeUrl: string,
): Record<string, string> {
  const trimmed = oneClickUnsubscribeUrl.trim();

  return {
    "List-Unsubscribe": `<${trimmed}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
