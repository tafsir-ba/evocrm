import {
  compactLocationKey,
  emptyProjectLocation,
  hasStructuredLocation,
  normalizeProjectLocation,
  type ProjectLocation,
  type ProjectLocationFallback,
  type ProjectLocationProvenance,
} from "@/lib/project-location";
import {
  PROJECT_LOCATION_CATALOG,
  catalogMatchKeys,
  type ProjectLocationCatalogEntry,
} from "@/lib/project-location-catalog";
import {
  extractPlaceSignal,
  type VerifiedSwissPlace,
} from "@/lib/swiss-place-gazetteer";

export type ProjectLocationMatchInput = {
  name: string;
  reference?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  location?: ProjectLocation | null;
};

export type ProjectLocationMatch =
  | {
      status: "matched";
      entry: ProjectLocationCatalogEntry;
      reason: "name" | "alias" | "reference" | "short_reference" | "place_signal";
    }
  | {
      status: "unresolved";
      entry: ProjectLocationCatalogEntry | null;
      reason:
        | "no_match"
        | "ambiguous"
        | "catalog_unresolved"
        | "name_conflict"
        | "ambiguous_place_signal";
      placeSignal?: string | null;
      placeNote?: string | null;
    };

export type ProjectLocationApplyDecision = {
  action: "apply" | "skip" | "review";
  reason: string;
  location: ProjectLocation;
  city: string | null;
  country: string | null;
  address: string | null;
  overwrittenManual: boolean;
};

const COUNTRY_ALIASES: Record<string, string[]> = {
  CH: ["switzerland", "suisse", "schweiz", "svizzera", "swiss", "ch"],
  JM: ["jamaica", "jamaique", "jamaïque", "jm"],
};

const LOCALITY_ALIASES: Record<string, string[]> = {
  geneva: ["geneva", "geneve", "genève", "ge"],
  kingston: ["kingston", "kingston8", "kingston2", "manorpark"],
  troinex: ["troinex"],
  vandoeuvres: ["vandoeuvres", "vandœuvres"],
  confignon: ["confignon"],
  prilly: ["prilly"],
  lemontsurlausanne: ["lemontsurlausanne", "montsurlausanne"],
  montegobay: ["montegobay", "montego"],
  commugny: ["commugny"],
  tannay: ["tannay"],
  rolle: ["rolle"],
  epalinges: ["epalinges"],
  brent: ["brent"],
  nyon: ["nyon"],
  veyrier: ["veyrier"],
  versoix: ["versoix"],
  collexbossy: ["collexbossy", "collex"],
  corsiervevey: ["corsiervevey", "corsiersurvevey"],
  gland: ["gland"],
  pully: ["pully"],
  chardonne: ["chardonne"],
  visp: ["visp", "viege"],
  thonex: ["thonex"],
  mathod: ["mathod"],
  ecublens: ["ecublens"],
};

export function matchProjectLocationCatalog(
  input: ProjectLocationMatchInput,
  catalog: ProjectLocationCatalogEntry[] = PROJECT_LOCATION_CATALOG,
): ProjectLocationMatch {
  const nameKey = compactLocationKey(input.name);
  const referenceKey = input.reference ? compactLocationKey(input.reference) : "";
  const matches: Array<{
    entry: ProjectLocationCatalogEntry;
    reason: "name" | "alias" | "reference" | "short_reference";
  }> = [];

  for (const entry of catalog) {
    const aliasKeys = catalogMatchKeys(entry);
    if (nameKey && aliasKeys.includes(nameKey)) {
      matches.push({
        entry,
        reason: nameKey === compactLocationKey(entry.displayName) ? "name" : "alias",
      });
      continue;
    }

    const longRefs = entry.references.map(compactLocationKey);
    if (referenceKey && longRefs.includes(referenceKey)) {
      if (nameKey && !aliasKeys.includes(nameKey) && !isGenericProjectName(nameKey)) {
        continue;
      }
      matches.push({ entry, reason: "reference" });
      continue;
    }

    const shortRefs = entry.shortReferences.map(compactLocationKey);
    if (referenceKey && shortRefs.includes(referenceKey)) {
      if (nameKey && aliasKeys.includes(nameKey)) {
        matches.push({ entry, reason: "short_reference" });
      }
    }
  }

  const unique = uniqueEntries(matches.map((match) => match.entry));
  if (unique.length > 1) {
    return { status: "unresolved", entry: null, reason: "ambiguous" };
  }
  if (unique.length === 1) {
    const match = matches.find((item) => item.entry.key === unique[0].key);
    if (!match) {
      return { status: "unresolved", entry: unique[0], reason: "no_match" };
    }
    if (match.entry.reviewStatus !== "verified" || match.entry.confidence !== "high") {
      return { status: "unresolved", entry: match.entry, reason: "catalog_unresolved" };
    }
    return { status: "matched", entry: match.entry, reason: match.reason };
  }

  const place = extractPlaceSignal(input.name, input.reference);
  if (place.status === "verified") {
    return {
      status: "matched",
      entry: catalogEntryFromVerifiedPlace(place.place),
      reason: "place_signal",
    };
  }
  if (place.status === "ambiguous") {
    return {
      status: "unresolved",
      entry: null,
      reason: "ambiguous_place_signal",
      placeSignal: place.signal.key,
      placeNote: place.signal.reason,
    };
  }

  return { status: "unresolved", entry: null, reason: "no_match" };
}

export function catalogEntryFromVerifiedPlace(
  place: VerifiedSwissPlace,
): ProjectLocationCatalogEntry {
  return {
    key: `place:${place.key}`,
    displayName: place.displayName,
    aliases: place.aliases,
    references: [],
    shortReferences: [],
    countryCode: "CH",
    countryName: "Switzerland",
    cantonCode: place.cantonCode,
    cantonName: place.cantonName,
    municipality: place.municipality,
    postalCode: place.postalCode,
    normalizedAddress: `${place.postalCode} ${place.municipality}`,
    latitude: place.latitude,
    longitude: place.longitude,
    precision: "locality",
    confidence: "high",
    reviewStatus: "verified",
    sourceUrl: place.sourceUrl,
    sources: [
      {
        url: place.sourceUrl,
        kind: "municipal_mapping",
        note: place.notes,
      },
    ],
    notes: `Place signal verified against the official Swiss commune register (gg25). ${place.notes}`,
  };
}

export function locationFromCatalogEntry(
  entry: ProjectLocationCatalogEntry,
  appliedAt: string,
  previousManual: ProjectLocationProvenance["previousManual"],
  notes?: string,
): ProjectLocation {
  return normalizeProjectLocation({
    countryCode: entry.countryCode,
    countryName: entry.countryName,
    cantonCode: entry.cantonCode,
    cantonName: entry.cantonName,
    municipality: entry.municipality,
    postalCode: entry.postalCode,
    normalizedAddress: entry.normalizedAddress,
    latitude: entry.latitude,
    longitude: entry.longitude,
    precision: entry.precision,
    sourceUrl: entry.sourceUrl,
    confidence: entry.confidence,
    reviewStatus: entry.reviewStatus,
    provenance: {
      method: "enrichment",
      catalogKey: entry.key,
      appliedAt,
      previousManual,
      notes: notes ?? entry.notes,
    },
  });
}

export function decideProjectLocationEnrichment(
  input: ProjectLocationMatchInput,
  options: { appliedAt?: string } = {},
): ProjectLocationApplyDecision {
  const appliedAt = options.appliedAt ?? new Date().toISOString();
  const existing = normalizeProjectLocation(input.location);
  const match = matchProjectLocationCatalog(input);

  if (match.status !== "matched") {
    const shouldFlagReview =
      (match.reason === "catalog_unresolved" ||
        match.reason === "ambiguous_place_signal") &&
      !hasStructuredLocation(existing);
    const reviewLocation = shouldFlagReview
      ? emptyProjectLocation({
          reviewStatus: "review_needed",
          provenance: {
            method: "enrichment",
            catalogKey: match.entry?.key ?? match.placeSignal ?? null,
            appliedAt,
            previousManual: null,
            notes:
              match.placeNote ??
              `Unresolved: ${match.reason}. ${match.entry?.notes ?? "No high-confidence public evidence applied."}`,
          },
        })
      : existing;

    return {
      action: shouldFlagReview ? "review" : "skip",
      reason: match.reason,
      location: reviewLocation,
      city: input.city ?? null,
      country: input.country ?? null,
      address: input.address ?? null,
      overwrittenManual: false,
    };
  }

  const entry = match.entry;
  const manual = {
    address: emptyToNull(input.address),
    city: emptyToNull(input.city),
    country: emptyToNull(input.country),
  };

  if (hasStructuredLocation(existing) && existing.provenance?.method === "manual") {
    return {
      action: "skip",
      reason: "manual_structured_location_preserved",
      location: existing,
      city: manual.city,
      country: manual.country,
      address: manual.address,
      overwrittenManual: false,
    };
  }

  const countryConflict = hasConflictingCountry(manual.country, entry.countryCode);
  const cityConflict = hasConflictingLocality(manual.city, entry);
  const cityIsBroaderRegion = isBroaderRegionLabel(manual.city, entry);

  if (cityConflict && !countryConflict && !cityIsBroaderRegion) {
    return {
      action: "review",
      reason: "manual_city_conflict",
      location: emptyProjectLocation({
        reviewStatus: "review_needed",
        sourceUrl: entry.sourceUrl,
        confidence: entry.confidence,
        provenance: {
          method: "enrichment",
          catalogKey: entry.key,
          appliedAt,
          previousManual: manual,
          notes: `Manual city "${manual.city}" conflicts with evidence for ${entry.displayName}. Not overwritten.`,
        },
      }),
      city: manual.city,
      country: manual.country,
      address: manual.address,
      overwrittenManual: false,
    };
  }

  const shouldCorrectCountry = countryConflict;
  const shouldFillCity = !manual.city || cityIsBroaderRegion || shouldCorrectCountry;
  const shouldFillCountry = !manual.country || shouldCorrectCountry;
  const overwrittenManual = Boolean(shouldCorrectCountry || cityIsBroaderRegion);

  const location = locationFromCatalogEntry(
    entry,
    appliedAt,
    overwrittenManual ? manual : existing.provenance?.previousManual ?? null,
    overwrittenManual
      ? `Corrected display location from evidence (${entry.sourceUrl}). Previous values retained in provenance.`
      : entry.notes,
  );

  return {
    action: "apply",
    reason: shouldCorrectCountry
      ? "high_confidence_country_correction"
      : cityIsBroaderRegion
        ? "high_confidence_locality_refinement"
        : match.reason === "place_signal"
          ? "verified_place_signal"
          : "high_confidence_backfill",
    location,
    city: shouldFillCity ? entry.municipality : manual.city,
    country: shouldFillCountry ? entry.countryName : manual.country,
    address: manual.address,
    overwrittenManual,
  };
}

export type CompactUnresolvedItem = {
  name: string;
  reference: string | null;
  category: "ambiguous_place" | "catalog_unresolved" | "no_place_signal";
  placeSignal: string | null;
  note: string;
};

export function describeUnresolvedDecision(
  input: ProjectLocationMatchInput,
  decision: ProjectLocationApplyDecision,
): CompactUnresolvedItem | null {
  if (decision.action === "apply") {
    return null;
  }
  if (/\[qa-/i.test(input.name)) {
    return null;
  }

  const match = matchProjectLocationCatalog(input);
  if (match.status === "unresolved" && match.reason === "ambiguous_place_signal") {
    return {
      name: input.name,
      reference: input.reference ?? null,
      category: "ambiguous_place",
      placeSignal: match.placeSignal ?? null,
      note: match.placeNote ?? "Place signal could not be uniquely verified.",
    };
  }
  if (match.status === "unresolved" && match.reason === "catalog_unresolved") {
    return {
      name: input.name,
      reference: input.reference ?? null,
      category: "catalog_unresolved",
      placeSignal: match.entry?.key ?? null,
      note: match.entry?.notes ?? "Catalog entry is not high-confidence verified.",
    };
  }
  if (decision.action === "review") {
    return {
      name: input.name,
      reference: input.reference ?? null,
      category: "ambiguous_place",
      placeSignal: decision.location.provenance?.catalogKey ?? null,
      note: decision.location.provenance?.notes ?? decision.reason,
    };
  }
  if (decision.reason === "no_match") {
    return {
      name: input.name,
      reference: input.reference ?? null,
      category: "no_place_signal",
      placeSignal: null,
      note: "No official project match and no unique verified municipality in the name/reference.",
    };
  }
  return null;
}

export function projectLocationFilterValue(
  location: ProjectLocation | null | undefined,
  fallback: ProjectLocationFallback = {},
): {
  countryCode: string | null;
  cantonCode: string | null;
  municipality: string | null;
} {
  return {
    countryCode: location?.countryCode ?? inferCountryCode(fallback.country),
    cantonCode: location?.cantonCode ?? null,
    municipality: location?.municipality ?? emptyToNull(fallback.city),
  };
}

function uniqueEntries(
  entries: ProjectLocationCatalogEntry[],
): ProjectLocationCatalogEntry[] {
  const seen = new Set<string>();
  const unique: ProjectLocationCatalogEntry[] = [];
  for (const entry of entries) {
    if (seen.has(entry.key)) continue;
    seen.add(entry.key);
    unique.push(entry);
  }
  return unique;
}

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function isGenericProjectName(nameKey: string): boolean {
  return [
    "default",
    "defaultproject",
    "general",
    "evohomegeneral",
    "evohomegeneraldatabase",
  ].includes(nameKey);
}

function inferCountryCode(value: string | null | undefined): string | null {
  const key = value ? compactLocationKey(value) : "";
  if (!key) return null;
  for (const [code, aliases] of Object.entries(COUNTRY_ALIASES)) {
    if (aliases.includes(key) || key === code.toLowerCase()) {
      return code;
    }
  }
  return null;
}

function hasConflictingCountry(
  manualCountry: string | null,
  evidenceCode: string | null,
): boolean {
  if (!manualCountry || !evidenceCode) return false;
  const inferred = inferCountryCode(manualCountry);
  if (!inferred) return false;
  return inferred !== evidenceCode;
}

function localityKeys(entry: ProjectLocationCatalogEntry): string[] {
  return [entry.municipality, entry.postalCode, entry.cantonName, entry.cantonCode]
    .filter((value): value is string => Boolean(value))
    .map(compactLocationKey);
}

function hasConflictingLocality(
  manualCity: string | null,
  entry: ProjectLocationCatalogEntry,
): boolean {
  if (!manualCity) return false;
  const cityKey = compactLocationKey(manualCity);
  if (localityKeys(entry).includes(cityKey)) return false;
  for (const aliases of Object.values(LOCALITY_ALIASES)) {
    if (aliases.includes(cityKey) && aliases.some((alias) => localityKeys(entry).includes(alias))) {
      return false;
    }
  }
  if (isBroaderRegionLabel(manualCity, entry)) return false;
  return Boolean(entry.municipality);
}

function isBroaderRegionLabel(
  manualCity: string | null,
  entry: ProjectLocationCatalogEntry,
): boolean {
  if (!manualCity) return false;
  const cityKey = compactLocationKey(manualCity);
  if (entry.countryCode === "CH" && LOCALITY_ALIASES.geneva.includes(cityKey)) {
    return compactLocationKey(entry.municipality ?? "") !== "geneve";
  }
  if (
    cityKey === "montreux" &&
    compactLocationKey(entry.municipality ?? "") === "brent"
  ) {
    return true;
  }
  if (entry.countryCode === "CH" && cityKey === compactLocationKey(entry.cantonName ?? "")) {
    return true;
  }
  return false;
}

