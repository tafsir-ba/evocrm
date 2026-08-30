import { compactLocationKey, type SwissCantonCode } from "@/lib/project-location";

export type SwissPlaceMatchMode = "exact_or_token";

export type VerifiedSwissPlace = {
  key: string;
  displayName: string;
  aliases: string[];
  municipality: string;
  cantonCode: SwissCantonCode;
  cantonName: "Genève" | "Vaud" | "Valais";
  postalCode: string;
  latitude: number;
  longitude: number;
  sourceUrl: string;
  notes: string;
};

export type AmbiguousPlaceSignal = {
  key: string;
  aliases: string[];
  reason: string;
};

/**
 * Official Swiss communes that appear as place signals in the CRM portfolio.
 * Coordinates are geo.admin.ch gg25 commune centroids, locality precision (3 dp).
 */
export const VERIFIED_SWISS_PLACES: VerifiedSwissPlace[] = [
  {
    key: "veyrier",
    displayName: "Veyrier",
    aliases: ["Veyrier"],
    municipality: "Veyrier",
    cantonCode: "GE",
    cantonName: "Genève",
    postalCode: "1255",
    latitude: 46.173,
    longitude: 6.164,
    sourceUrl:
      "https://api3.geo.admin.ch/rest/services/api/SearchServer?searchText=Veyrier&type=locations&origins=gg25",
    notes: "Official Swiss commune Veyrier (GE). PLZ 1255 from the federal zipcode layer.",
  },
  {
    key: "versoix",
    displayName: "Versoix",
    aliases: ["Versoix"],
    municipality: "Versoix",
    cantonCode: "GE",
    cantonName: "Genève",
    postalCode: "1290",
    latitude: 46.291,
    longitude: 6.156,
    sourceUrl:
      "https://api3.geo.admin.ch/rest/services/api/SearchServer?searchText=Versoix&type=locations&origins=gg25",
    notes:
      "Official Swiss commune Versoix (GE). PLZ 1290 also serves Chavannes-des-Bois; municipality is Versoix.",
  },
  {
    key: "collex-bossy",
    displayName: "Collex-Bossy",
    aliases: ["Collex-Bossy", "Collex Bossy", "Collex"],
    municipality: "Collex-Bossy",
    cantonCode: "GE",
    cantonName: "Genève",
    postalCode: "1239",
    latitude: 46.279,
    longitude: 6.121,
    sourceUrl:
      "https://api3.geo.admin.ch/rest/services/api/SearchServer?searchText=Collex-Bossy&type=locations&origins=gg25",
    notes: "Official Swiss commune Collex-Bossy (GE). Federal zipcode label is 1239 - Collex.",
  },
  {
    key: "corsier-sur-vevey",
    displayName: "Corsier-sur-Vevey",
    aliases: ["Corsier-sur-Vevey", "Corsier sur Vevey"],
    municipality: "Corsier-sur-Vevey",
    cantonCode: "VD",
    cantonName: "Vaud",
    postalCode: "1804",
    latitude: 46.494,
    longitude: 6.872,
    sourceUrl:
      "https://api3.geo.admin.ch/rest/services/api/SearchServer?searchText=Corsier-sur-Vevey&type=locations&origins=gg25",
    notes:
      "Official Swiss commune Corsier-sur-Vevey (VD), distinct from Corsier (GE) and Vevey.",
  },
  {
    key: "gland",
    displayName: "Gland",
    aliases: ["Gland"],
    municipality: "Gland",
    cantonCode: "VD",
    cantonName: "Vaud",
    postalCode: "1196",
    latitude: 46.411,
    longitude: 6.288,
    sourceUrl:
      "https://api3.geo.admin.ch/rest/services/api/SearchServer?searchText=Gland&type=locations&origins=gg25",
    notes:
      "Official Swiss commune Gland (VD). Agency qualifiers such as Cardis or Evo do not change the locality.",
  },
  {
    key: "pully",
    displayName: "Pully",
    aliases: ["Pully"],
    municipality: "Pully",
    cantonCode: "VD",
    cantonName: "Vaud",
    postalCode: "1009",
    latitude: 46.479,
    longitude: 6.654,
    sourceUrl:
      "https://api3.geo.admin.ch/rest/services/api/SearchServer?searchText=Pully&type=locations&origins=gg25",
    notes: "Official Swiss commune Pully (VD). Project prefix TDL is not used as an address.",
  },
  {
    key: "chardonne",
    displayName: "Chardonne",
    aliases: ["Chardonne"],
    municipality: "Chardonne",
    cantonCode: "VD",
    cantonName: "Vaud",
    postalCode: "1803",
    latitude: 46.472,
    longitude: 6.806,
    sourceUrl:
      "https://api3.geo.admin.ch/rest/services/api/SearchServer?searchText=Chardonne&type=locations&origins=gg25",
    notes: "Official Swiss commune Chardonne (VD).",
  },
  {
    key: "visp",
    displayName: "Visp",
    aliases: ["Visp", "Viège"],
    municipality: "Visp",
    cantonCode: "VS",
    cantonName: "Valais",
    postalCode: "3930",
    latitude: 46.287,
    longitude: 7.867,
    sourceUrl:
      "https://api3.geo.admin.ch/rest/services/api/SearchServer?searchText=Visp&type=locations&origins=gg25",
    notes:
      "Official Swiss commune Visp / Viège (VS). Distinct from Visperterminen. PLZ 3930 also serves Eyholz.",
  },
  {
    key: "mathod",
    displayName: "Mathod",
    aliases: ["Mathod"],
    municipality: "Mathod",
    cantonCode: "VD",
    cantonName: "Vaud",
    postalCode: "1438",
    latitude: 46.76,
    longitude: 6.561,
    sourceUrl:
      "https://api3.geo.admin.ch/rest/services/api/SearchServer?searchText=Mathod&type=locations&origins=gg25",
    notes: "Official Swiss commune Mathod (VD). PLZ 1438 from the federal zipcode layer.",
  },
];

/**
 * Place words that look locational but are not a unique verified municipality.
 * These stay review-needed until the user or an official project page disambiguates.
 */
export const AMBIGUOUS_PLACE_SIGNALS: AmbiguousPlaceSignal[] = [
  {
    key: "cressy",
    aliases: ["Cressy"],
    reason:
      "Cressy (Geneva) is an intercommunal quartier on Confignon, Bernex and Onex, and is not the communes Cressier (FR/NE). Municipality left open.",
  },
  {
    key: "kingston",
    aliases: ["Kingston", "BC Kingston"],
    reason:
      "Kingston is not a unique country or project. Grosvenor Vistas and K2 have their own catalog evidence; BC Kingston does not.",
  },
  {
    key: "jardin-des-nations",
    aliases: ["Jardin des Nations", "Jardins des Nations"],
    reason:
      "Jardin des Nations is a Geneva-area neighbourhood spanning more than one commune (Pregny-Chambésy / Grand-Saconnex). Not a unique municipality.",
  },
  {
    key: "seymaz",
    aliases: ["Seymaz", "Seymaz 44"],
    reason:
      "La Seymaz is a watercourse / sector name, not a Swiss commune. Street number 44 is not treated as a verified address.",
  },
  {
    key: "bude",
    aliases: ["Budé", "Bude", "Budé The Residence"],
    reason:
      "Budé is a Geneva neighbourhood (Petit-Saconnex / City of Geneva), not a unique Swiss commune. Official project site not verified.",
  },
];

export type PlaceSignalMatch =
  | {
      status: "verified";
      place: VerifiedSwissPlace;
      matchedOn: string;
    }
  | {
      status: "ambiguous";
      signal: AmbiguousPlaceSignal;
      matchedOn: string;
    }
  | {
      status: "none";
    };

export function placeNameTokens(value: string): string[] {
  return value
    .replace(/[()[\]{}]/g, " ")
    .replace(/[_/]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

export function extractPlaceSignal(
  name: string,
  reference?: string | null,
): PlaceSignalMatch {
  const haystacks = new Set(
    [
      compactLocationKey(name),
      reference ? compactLocationKey(reference) : "",
      ...placeNameTokens(name).map(compactLocationKey),
      ...(reference ? placeNameTokens(reference).map(compactLocationKey) : []),
    ].filter(Boolean),
  );

  const ambiguous = AMBIGUOUS_PLACE_SIGNALS.filter((signal) =>
    signal.aliases.some((alias) => haystacks.has(compactLocationKey(alias))),
  );
  if (ambiguous.length === 1) {
    return {
      status: "ambiguous",
      signal: ambiguous[0],
      matchedOn: ambiguous[0].aliases[0],
    };
  }
  if (ambiguous.length > 1) {
    return {
      status: "ambiguous",
      signal: ambiguous[0],
      matchedOn: ambiguous.map((item) => item.key).join(","),
    };
  }

  const verified = VERIFIED_SWISS_PLACES.filter((place) =>
    place.aliases.some((alias) => haystacks.has(compactLocationKey(alias))),
  );
  if (verified.length === 1) {
    return {
      status: "verified",
      place: verified[0],
      matchedOn: verified[0].displayName,
    };
  }
  if (verified.length > 1) {
    return {
      status: "ambiguous",
      signal: {
        key: "multiple-communes",
        aliases: verified.map((place) => place.displayName),
        reason: `Name matches more than one official commune: ${verified
          .map((place) => place.displayName)
          .join(", ")}.`,
      },
      matchedOn: verified.map((place) => place.key).join(","),
    };
  }

  return { status: "none" };
}
