/**
 * Resend returns DNS host labels relative to the parent zone.
 * For sending domain `crm.evo-home.ch`, host `send.crm` means `send.crm.evo-home.ch`.
 */
export function getDnsParentZone(sendingDomain: string): string {
  const normalizedDomain = sendingDomain.trim().replace(/\.$/, "").toLowerCase();
  const labels = normalizedDomain.split(".").filter(Boolean);

  if (labels.length <= 2) {
    return normalizedDomain;
  }

  return labels.slice(1).join(".");
}

export function formatDnsHostFqdn(host: string, sendingDomain: string): string {
  const normalizedHost = host.trim().replace(/\.$/, "").toLowerCase();
  const normalizedDomain = sendingDomain.trim().replace(/\.$/, "").toLowerCase();

  if (!normalizedHost) {
    return normalizedDomain;
  }

  if (normalizedHost === normalizedDomain || normalizedHost.endsWith(`.${normalizedDomain}`)) {
    return normalizedHost;
  }

  const parentZone = getDnsParentZone(normalizedDomain);

  if (normalizedHost.endsWith(`.${parentZone}`)) {
    return normalizedHost;
  }

  return `${normalizedHost}.${parentZone}`;
}

export function providerIncludesDmarcRecord(
  records: Array<{ record: string }>,
): boolean {
  return records.some((record) => record.record.toUpperCase() === "DMARC");
}
