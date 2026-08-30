export const PROJECT_LOCATION_PRECISIONS = [
  "exact_project",
  "address",
  "locality",
  "unknown",
] as const;

export type ProjectLocationPrecision = (typeof PROJECT_LOCATION_PRECISIONS)[number];

export const PROJECT_LOCATION_CONFIDENCE = ["high", "medium", "low"] as const;

export type ProjectLocationConfidence = (typeof PROJECT_LOCATION_CONFIDENCE)[number];

export const PROJECT_LOCATION_REVIEW_STATUSES = [
  "verified",
  "review_needed",
  "unresolved",
] as const;

export type ProjectLocationReviewStatus =
  (typeof PROJECT_LOCATION_REVIEW_STATUSES)[number];

export const PROJECT_LOCATION_METHODS = [
  "enrichment",
  "manual",
  "seed",
  "user_confirmed",
] as const;

export type ProjectLocationMethod = (typeof PROJECT_LOCATION_METHODS)[number];

export type ProjectLocationProvenance = {
  method: ProjectLocationMethod;
  catalogKey: string | null;
  appliedAt: string | null;
  previousManual: {
    address: string | null;
    city: string | null;
    country: string | null;
  } | null;
  notes: string | null;
};

export type ProjectLocation = {
  countryCode: string | null;
  countryName: string | null;
  cantonCode: string | null;
  cantonName: string | null;
  municipality: string | null;
  postalCode: string | null;
  normalizedAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  precision: ProjectLocationPrecision;
  sourceUrl: string | null;
  confidence: ProjectLocationConfidence | null;
  reviewStatus: ProjectLocationReviewStatus;
  provenance: ProjectLocationProvenance | null;
};

export type ProjectLocationFallback = {
  address?: string | null;
  city?: string | null;
  country?: string | null;
};

/** Official Swiss Confederation 2-letter canton codes and names. */
export const SWISS_CANTONS = {
  AG: "Aargau",
  AI: "Appenzell Innerrhoden",
  AR: "Appenzell Ausserrhoden",
  BE: "Bern",
  BL: "Basel-Landschaft",
  BS: "Basel-Stadt",
  FR: "Fribourg",
  GE: "Genève",
  GL: "Glarus",
  GR: "Graubünden",
  JU: "Jura",
  LU: "Lucerne",
  NE: "Neuchâtel",
  NW: "Nidwalden",
  OW: "Obwalden",
  SG: "St. Gallen",
  SH: "Schaffhausen",
  SO: "Solothurn",
  SZ: "Schwyz",
  TG: "Thurgau",
  TI: "Ticino",
  UR: "Uri",
  VD: "Vaud",
  VS: "Valais",
  ZG: "Zug",
  ZH: "Zürich",
} as const;

export type SwissCantonCode = keyof typeof SWISS_CANTONS;

export const COUNTRY_DISPLAY_NAMES: Record<string, string> = {
  CH: "Switzerland",
  JM: "Jamaica",
};

export const COORDINATE_DECIMAL_PLACES: Record<ProjectLocationPrecision, number | null> =
  {
    exact_project: 5,
    address: 5,
    locality: 3,
    unknown: null,
  };

export function emptyProjectLocation(
  overrides: Partial<ProjectLocation> = {},
): ProjectLocation {
  return {
    countryCode: null,
    countryName: null,
    cantonCode: null,
    cantonName: null,
    municipality: null,
    postalCode: null,
    normalizedAddress: null,
    latitude: null,
    longitude: null,
    precision: "unknown",
    sourceUrl: null,
    confidence: null,
    reviewStatus: "unresolved",
    provenance: null,
    ...overrides,
  };
}

export function normalizeCountryCode(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toUpperCase();
  return trimmed && /^[A-Z]{2}$/.test(trimmed) ? trimmed : null;
}

export function normalizeCantonCode(
  value: string | null | undefined,
): SwissCantonCode | null {
  const trimmed = value?.trim().toUpperCase();
  if (!trimmed || !(trimmed in SWISS_CANTONS)) return null;
  return trimmed as SwissCantonCode;
}

export function countryDisplayName(code: string | null | undefined): string | null {
  const normalized = normalizeCountryCode(code);
  if (!normalized) return null;
  if (COUNTRY_DISPLAY_NAMES[normalized]) {
    return COUNTRY_DISPLAY_NAMES[normalized];
  }
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(normalized) ?? normalized;
  } catch {
    return normalized;
  }
}

export function cantonDisplayName(code: string | null | undefined): string | null {
  const normalized = normalizeCantonCode(code);
  if (!normalized) return null;
  return SWISS_CANTONS[normalized];
}

export function roundCoordinate(
  value: number,
  precision: ProjectLocationPrecision,
): number | null {
  const places = COORDINATE_DECIMAL_PLACES[precision];
  if (places == null || !Number.isFinite(value)) {
    return null;
  }
  return Number(value.toFixed(places));
}

export function hasStructuredLocation(
  location: ProjectLocation | null | undefined,
): boolean {
  if (!location) return false;
  return Boolean(
    location.countryCode ||
      location.countryName ||
      location.municipality ||
      location.postalCode ||
      location.normalizedAddress,
  );
}

export function formatStructuredProjectLocation(
  location: ProjectLocation | null | undefined,
): string {
  if (!location || !hasStructuredLocation(location)) {
    return "—";
  }

  const country = location.countryName ?? countryDisplayName(location.countryCode);
  const municipality = location.municipality?.trim() || null;
  const postal = location.postalCode?.trim() || null;
  const canton = location.cantonName ?? cantonDisplayName(location.cantonCode);

  if (location.countryCode === "JM" && postal) {
    return [postal, country].filter(Boolean).join(", ");
  }

  if (location.countryCode === "CH" && municipality && canton) {
    return `${municipality}, ${canton}`;
  }

  return [municipality ?? postal, country].filter(Boolean).join(", ") || "—";
}

export function formatProjectLocationLabel(
  location: ProjectLocation | null | undefined,
  fallback: ProjectLocationFallback = {},
): string {
  const structured = formatStructuredProjectLocation(location);
  if (structured !== "—") {
    return structured;
  }

  const parts = [fallback.city, fallback.country]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(", ") : "—";
}

export function formatProjectLocationDetail(
  location: ProjectLocation | null | undefined,
  fallback: ProjectLocationFallback = {},
): string {
  if (location?.normalizedAddress?.trim()) {
    return location.normalizedAddress.trim();
  }

  const structured = formatStructuredProjectLocation(location);
  if (structured !== "—") {
    return structured;
  }

  const parts = [fallback.address, fallback.city, fallback.country]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(", ") : "—";
}

export function compactLocationKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function normalizeProjectLocation(
  value: Partial<ProjectLocation> | null | undefined,
): ProjectLocation {
  const precision = PROJECT_LOCATION_PRECISIONS.includes(
    value?.precision as ProjectLocationPrecision,
  )
    ? (value?.precision as ProjectLocationPrecision)
    : "unknown";

  return emptyProjectLocation({
    countryCode: normalizeCountryCode(value?.countryCode ?? null),
    countryName: value?.countryName?.trim() || countryDisplayName(value?.countryCode),
    cantonCode: normalizeCantonCode(value?.cantonCode ?? null),
    cantonName: value?.cantonName?.trim() || cantonDisplayName(value?.cantonCode),
    municipality: value?.municipality?.trim() || null,
    postalCode: value?.postalCode?.trim() || null,
    normalizedAddress: value?.normalizedAddress?.trim() || null,
    latitude:
      value?.latitude == null ? null : roundCoordinate(value.latitude, precision),
    longitude:
      value?.longitude == null ? null : roundCoordinate(value.longitude, precision),
    precision,
    sourceUrl: value?.sourceUrl?.trim() || null,
    confidence: PROJECT_LOCATION_CONFIDENCE.includes(
      value?.confidence as ProjectLocationConfidence,
    )
      ? (value?.confidence as ProjectLocationConfidence)
      : null,
    reviewStatus: PROJECT_LOCATION_REVIEW_STATUSES.includes(
      value?.reviewStatus as ProjectLocationReviewStatus,
    )
      ? (value?.reviewStatus as ProjectLocationReviewStatus)
      : "unresolved",
    provenance: value?.provenance ?? null,
  });
}
