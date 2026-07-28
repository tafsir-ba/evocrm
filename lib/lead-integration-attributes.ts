/**
 * Helpers for website / integration attribution stored on Lead.attributes.
 */
export type LeadIntegrationUtm = {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
};

export type LeadIntegrationAttributes = {
  integrationId?: string;
  externalId?: string;
  idempotencyKey?: string;
  inboundSource?: string;
  propertyReference?: string;
  utm?: LeadIntegrationUtm;
};

export function readLeadIntegrationAttributes(
  attributes: Record<string, unknown> | null | undefined,
): LeadIntegrationAttributes | null {
  if (!attributes || typeof attributes !== "object") {
    return null;
  }

  const raw = attributes.integration;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const integration = raw as Record<string, unknown>;
  const utmRaw =
    integration.utm && typeof integration.utm === "object" && !Array.isArray(integration.utm)
      ? (integration.utm as Record<string, unknown>)
      : null;

  const utm: LeadIntegrationUtm | undefined = utmRaw
    ? {
        ...(typeof utmRaw.source === "string" ? { source: utmRaw.source } : {}),
        ...(typeof utmRaw.medium === "string" ? { medium: utmRaw.medium } : {}),
        ...(typeof utmRaw.campaign === "string" ? { campaign: utmRaw.campaign } : {}),
        ...(typeof utmRaw.term === "string" ? { term: utmRaw.term } : {}),
        ...(typeof utmRaw.content === "string" ? { content: utmRaw.content } : {}),
      }
    : undefined;

  const result: LeadIntegrationAttributes = {
    ...(typeof integration.integrationId === "string"
      ? { integrationId: integration.integrationId }
      : {}),
    ...(typeof integration.externalId === "string" ? { externalId: integration.externalId } : {}),
    ...(typeof integration.idempotencyKey === "string"
      ? { idempotencyKey: integration.idempotencyKey }
      : {}),
    ...(typeof integration.inboundSource === "string"
      ? { inboundSource: integration.inboundSource }
      : {}),
    ...(typeof integration.propertyReference === "string"
      ? { propertyReference: integration.propertyReference }
      : {}),
    ...(utm && Object.keys(utm).length > 0 ? { utm } : {}),
  };

  return Object.keys(result).length > 0 ? result : null;
}

export function formatLeadUtmSummary(utm: LeadIntegrationUtm | undefined): string {
  if (!utm) {
    return "—";
  }

  const parts = [
    utm.campaign ? `campaign: ${utm.campaign}` : null,
    utm.source ? `source: ${utm.source}` : null,
    utm.medium ? `medium: ${utm.medium}` : null,
    utm.term ? `term: ${utm.term}` : null,
    utm.content ? `content: ${utm.content}` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" · ") : "—";
}
