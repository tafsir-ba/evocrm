/**
 * Resend returns DNS host labels relative to the parent zone.
 * For sending domain `crm.evo-home.ch`, host `send.crm` means `send.crm.evo-home.ch`.
 */
export function formatDnsHostFqdn(host: string, sendingDomain: string): string {
  const normalizedHost = host.trim().replace(/\.$/, "").toLowerCase();
  const normalizedDomain = sendingDomain.trim().replace(/\.$/, "").toLowerCase();

  if (!normalizedHost) {
    return normalizedDomain;
  }

  if (normalizedHost === normalizedDomain || normalizedHost.endsWith(`.${normalizedDomain}`)) {
    return normalizedHost;
  }

  const parentZone = normalizedDomain.includes(".")
    ? normalizedDomain.slice(normalizedDomain.indexOf(".") + 1)
    : normalizedDomain;

  if (normalizedHost.endsWith(`.${parentZone}`)) {
    return normalizedHost;
  }

  return `${normalizedHost}.${parentZone}`;
}
