export const LEAD_INTELLIGENCE_FIELDS = [
  "industry",
  "jobTitle",
  "stateRegion",
  "companyId",
] as const;

export type LeadIntelligenceField = (typeof LEAD_INTELLIGENCE_FIELDS)[number];

export const LEAD_INTELLIGENCE_FIELD_LABELS: Record<LeadIntelligenceField, string> = {
  industry: "Industry",
  jobTitle: "Job title",
  stateRegion: "State / region",
  companyId: "Associated company",
};

export const LEAD_FIELD_PROVENANCE_METHODS = [
  "manual",
  "hubspot",
  "import",
  "website",
  "api",
  "enrichment",
] as const;

export type LeadFieldProvenanceMethod = (typeof LEAD_FIELD_PROVENANCE_METHODS)[number];

export type LeadFieldProvenance = {
  method: LeadFieldProvenanceMethod;
  source: string;
  appliedAt: string;
  notes: string | null;
};

export const LEAD_PROVENANCE_TRACKED_FIELDS = [
  ...LEAD_INTELLIGENCE_FIELDS,
  "city",
  "country",
  "professionalProfileUrl",
] as const;

export type LeadProvenanceTrackedField = (typeof LEAD_PROVENANCE_TRACKED_FIELDS)[number];

export type LeadIntelligenceProvenance = Partial<
  Record<LeadProvenanceTrackedField, LeadFieldProvenance | null>
>;

export type LeadIntelligenceValues = {
  industry: string | null;
  jobTitle: string | null;
  stateRegion: string | null;
  companyId: string | null;
};

export const HUBSPOT_CONTACT_IDEMPOTENCY_PREFIX = "hubspot:contact:";

export function parseHubSpotContactIdFromIdempotencyKey(
  key: string | null | undefined,
): string | null {
  if (!key?.startsWith(HUBSPOT_CONTACT_IDEMPOTENCY_PREFIX)) {
    return null;
  }
  const rest = key.slice(HUBSPOT_CONTACT_IDEMPOTENCY_PREFIX.length).trim();
  if (!rest) {
    return null;
  }
  const projectIdx = rest.indexOf(":project:");
  const contactId = (projectIdx >= 0 ? rest.slice(0, projectIdx) : rest).trim();
  return contactId || null;
}

export function readHubSpotContactIdFromLeadAttributes(
  attributes: Record<string, unknown> | null | undefined,
): string | null {
  if (!attributes || typeof attributes !== "object") {
    return null;
  }
  const raw = attributes.integration;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const integration = raw as Record<string, unknown>;
  const fromKey = parseHubSpotContactIdFromIdempotencyKey(
    typeof integration.idempotencyKey === "string" ? integration.idempotencyKey : null,
  );
  if (fromKey) {
    return fromKey;
  }
  if (
    integration.inboundSource === "hubspot" &&
    typeof integration.externalId === "string" &&
    integration.externalId.trim()
  ) {
    return integration.externalId.trim();
  }
  return null;
}

/** Shared field contract for CRM + HubSpot CMP mapping. Do not invent extra keys. */
export const HUBSPOT_LEAD_INTELLIGENCE_PROPERTIES = [
  "industry",
  "jobtitle",
  "state",
  "hs_state_code",
  "company",
  "associatedcompanyid",
  "product_intersted_in",
] as const;

export const HUBSPOT_CMP_PRODUCT_VALUE = "CMP";

export function isBlankIntelligenceValue(value: string | null | undefined): boolean {
  return value == null || String(value).trim() === "";
}

export function normalizeIntelligenceText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function isHubSpotOwnedProvenance(
  provenance: LeadFieldProvenance | null | undefined,
): boolean {
  return provenance?.method === "hubspot";
}

export type IntelligenceApplyDecision =
  | "apply"
  | "skip_blank_incoming"
  | "skip_preserved"
  | "skip_unchanged";

/**
 * HubSpot/import enrichment may fill blanks or refresh HubSpot-owned values.
 * Manual, website, import, API, and user-accepted web-enrichment values are preserved.
 */
export function canApplyIntelligenceValue(input: {
  existingValue: string | null | undefined;
  existingProvenance: LeadFieldProvenance | null | undefined;
  incomingValue: string | null | undefined;
}): IntelligenceApplyDecision {
  if (isBlankIntelligenceValue(input.incomingValue)) {
    return "skip_blank_incoming";
  }
  if (isBlankIntelligenceValue(input.existingValue)) {
    if (input.existingProvenance?.method === "manual") {
      return "skip_preserved";
    }
    return "apply";
  }
  if (isHubSpotOwnedProvenance(input.existingProvenance)) {
    const existing = normalizeIntelligenceText(input.existingValue);
    const incoming = normalizeIntelligenceText(input.incomingValue);
    if (existing === incoming) {
      return "skip_unchanged";
    }
    return "apply";
  }
  return "skip_preserved";
}

export function buildLeadFieldProvenance(input: {
  method: LeadFieldProvenanceMethod;
  source: string;
  appliedAt?: Date | string;
  notes?: string | null;
}): LeadFieldProvenance {
  const appliedAt =
    input.appliedAt instanceof Date
      ? input.appliedAt.toISOString()
      : input.appliedAt ?? new Date().toISOString();

  return {
    method: input.method,
    source: input.source,
    appliedAt,
    notes: input.notes?.trim() || null,
  };
}

export function mergeIntelligenceProvenance(
  existing: LeadIntelligenceProvenance | null | undefined,
  updates: LeadIntelligenceProvenance,
): LeadIntelligenceProvenance {
  return {
    ...(existing ?? {}),
    ...updates,
  };
}

export function hubspotPropertiesIndicateCmp(
  productInterestedIn: string | null | undefined,
): boolean {
  if (!productInterestedIn) {
    return false;
  }
  return productInterestedIn
    .split(/[;|,]/)
    .map((part) => part.trim().toUpperCase())
    .includes(HUBSPOT_CMP_PRODUCT_VALUE);
}

export function mapHubSpotStateRegion(properties: {
  state?: string | null;
  hs_state_code?: string | null;
}): string | null {
  return normalizeIntelligenceText(properties.state) ?? normalizeIntelligenceText(properties.hs_state_code);
}

export function planIntelligenceFieldWrites(input: {
  existing: LeadIntelligenceValues;
  incoming: Partial<LeadIntelligenceValues>;
  existingProvenance?: LeadIntelligenceProvenance | null;
  incomingProvenance: LeadFieldProvenance;
}): {
  values: Partial<LeadIntelligenceValues>;
  provenance: LeadIntelligenceProvenance;
  applied: LeadIntelligenceField[];
  skipped: Array<{ field: LeadIntelligenceField; reason: IntelligenceApplyDecision }>;
} {
  const values: Partial<LeadIntelligenceValues> = {};
  const provenance: LeadIntelligenceProvenance = {};
  const applied: LeadIntelligenceField[] = [];
  const skipped: Array<{ field: LeadIntelligenceField; reason: IntelligenceApplyDecision }> = [];

  for (const field of LEAD_INTELLIGENCE_FIELDS) {
    if (!(field in input.incoming)) {
      continue;
    }
    const decision = canApplyIntelligenceValue({
      existingValue: input.existing[field],
      existingProvenance: input.existingProvenance?.[field],
      incomingValue: input.incoming[field],
    });
    if (decision !== "apply") {
      skipped.push({ field, reason: decision });
      continue;
    }
    values[field] = normalizeIntelligenceText(input.incoming[field] ?? null);
    provenance[field] = input.incomingProvenance;
    applied.push(field);
  }

  return { values, provenance, applied, skipped };
}
