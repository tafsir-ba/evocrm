import {
  compactLocationKey,
  type ProjectLocationConfidence,
  type ProjectLocationPrecision,
  type ProjectLocationReviewStatus,
} from "@/lib/project-location";

export type ProjectLocationSourceKind =
  | "official_project_site"
  | "developer_site"
  | "agency_portfolio"
  | "municipal_mapping"
  | "authoritative_press";

export type ProjectLocationCatalogSource = {
  url: string;
  kind: ProjectLocationSourceKind;
  note: string;
};

export type ProjectLocationCatalogEntry = {
  key: string;
  displayName: string;
  aliases: string[];
  references: string[];
  /** Short references (e.g. GV) only match when the project name also confirms the alias. */
  shortReferences: string[];
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
  confidence: ProjectLocationConfidence | null;
  reviewStatus: ProjectLocationReviewStatus;
  sourceUrl: string | null;
  sources: ProjectLocationCatalogSource[];
  notes: string;
};

export const PROJECT_LOCATION_CATALOG: ProjectLocationCatalogEntry[] = [
  {
    key: "grosvenor-vistas",
    displayName: "Grosvenor Vistas",
    aliases: [
      "Grosvenor Vistas",
      "Grosvenor",
      "grosvenorvistas",
      "Grosvenor Heights",
    ],
    references: ["grosvenorvistas"],
    shortReferences: ["GV"],
    countryCode: "JM",
    countryName: "Jamaica",
    cantonCode: null,
    cantonName: null,
    municipality: "Kingston",
    postalCode: "Kingston 8",
    normalizedAddress: "3A Grosvenor Heights, Manor Park, Kingston 8, Jamaica",
    latitude: null,
    longitude: null,
    precision: "address",
    confidence: "high",
    reviewStatus: "verified",
    sourceUrl: "https://grosvenorvistas.com/",
    sources: [
      {
        url: "https://grosvenorvistas.com/",
        kind: "official_project_site",
        note: "Official project site: Grosvenor Heights, Manor Park, Kingston 8; contact address 3A Grosvenor Heights.",
      },
      {
        url: "https://evo-home.ch/en/",
        kind: "agency_portfolio",
        note: "EvoHome portfolio lists Grosvenor Vistas as Kingston, Jamaica — not Switzerland.",
      },
    ],
    notes:
      "Must never be treated as Swiss. No official coordinate published; lat/lng omitted at address precision.",
  },
  {
    key: "le-parc-des-crets",
    displayName: "Le Parc des Crêts",
    aliases: [
      "Le Parc des Crêts",
      "Le Parc des Crets",
      "Parc des Crêts",
      "Parc des Crets",
      "leparcdescrets",
    ],
    references: ["leparcdescrets", "LEPARCDESCRETS"],
    shortReferences: [],
    countryCode: "CH",
    countryName: "Switzerland",
    cantonCode: "GE",
    cantonName: "Genève",
    municipality: "Troinex",
    postalCode: "1256",
    normalizedAddress: "Route de Troinex, 1256 Troinex",
    latitude: 46.158,
    longitude: 6.157,
    precision: "locality",
    confidence: "high",
    reviewStatus: "verified",
    sourceUrl: "https://leparcdescrets.ch/",
    sources: [
      {
        url: "https://leparcdescrets.ch/",
        kind: "official_project_site",
        note: "Official site places the development in Troinex.",
      },
      {
        url: "https://api3.geo.admin.ch/rest/services/api/SearchServer?searchText=1256&type=locations&origins=zipcode",
        kind: "municipal_mapping",
        note: "Swiss federal geo.admin.ch zipcode layer: 1256 - Troinex.",
      },
      {
        url: "https://api3.geo.admin.ch/rest/services/api/SearchServer?searchText=Troinex&type=locations&origins=gg25",
        kind: "municipal_mapping",
        note: "Official commune centroid rounded to 3 decimals (locality precision).",
      },
    ],
    notes:
      "Park-scale development. Street number 65 is the Vitae senior residence inside the park, not used as the project centroid.",
  },
  {
    key: "v77",
    displayName: "V77",
    aliases: ["V77", "Vandœuvres V77", "Vandoeuvres V77", "Vandoeuvres 77"],
    references: ["v77"],
    shortReferences: [],
    countryCode: "CH",
    countryName: "Switzerland",
    cantonCode: "GE",
    cantonName: "Genève",
    municipality: "Vandœuvres",
    postalCode: "1253",
    normalizedAddress: "Route de Vandœuvres, 1253 Vandœuvres",
    latitude: 46.22,
    longitude: 6.203,
    precision: "locality",
    confidence: "high",
    reviewStatus: "verified",
    sourceUrl: "https://v77.ch/en/",
    sources: [
      {
        url: "https://v77.ch/en/",
        kind: "official_project_site",
        note: "Official site: heart of Vandœuvres, bordered by Route de Vandœuvres.",
      },
      {
        url: "https://swissroc.ch/fr/projets/v77-vandoeuvres/",
        kind: "developer_site",
        note: "Swissroc developer page: commune of Vandœuvres, canton of Geneva.",
      },
      {
        url: "https://api3.geo.admin.ch/rest/services/api/SearchServer?searchText=1253&type=locations&origins=zipcode",
        kind: "municipal_mapping",
        note: "Swiss federal zipcode layer: 1253 - Vandoeuvres.",
      },
    ],
    notes:
      "No house number taken from the project name. Location is the commune / Route de Vandœuvres project area.",
  },
  {
    key: "residence-les-pins",
    displayName: "Résidence les Pins",
    aliases: [
      "Résidence les Pins",
      "Residence les Pins",
      "Résidence les pins",
      "Les Pins",
    ],
    references: ["residence-les-pins", "lespins"],
    shortReferences: [],
    countryCode: "CH",
    countryName: "Switzerland",
    cantonCode: "GE",
    cantonName: "Genève",
    municipality: "Confignon",
    postalCode: "1232",
    normalizedAddress: "1232 Confignon",
    latitude: 46.178,
    longitude: 6.087,
    precision: "locality",
    confidence: "high",
    reviewStatus: "verified",
    sourceUrl: "https://www.evo-home.ch/fr/projects/residence-les-pins",
    sources: [
      {
        url: "https://www.evo-home.ch/fr/projects/residence-les-pins",
        kind: "agency_portfolio",
        note: "EvoHome project page: family development on a 2,915 m² parcel in Confignon, Geneva.",
      },
      {
        url: "https://api3.geo.admin.ch/rest/services/api/SearchServer?searchText=1232&type=locations&origins=zipcode",
        kind: "municipal_mapping",
        note: "Swiss federal zipcode layer: 1232 - Confignon.",
      },
    ],
    notes: "No official street address published. Locality-level only.",
  },
  {
    key: "buissonniere-4",
    displayName: "Buissonnière 4",
    aliases: [
      "Buissonnière 4",
      "Buissonniere 4",
      "Prilly Buissonnière",
      "Prilly Buissonniere",
      "Buissonnière Rockwell",
      "Buissonniere Rockwell",
    ],
    references: ["buissonniere4", "prilly-buissonniere4"],
    shortReferences: [],
    countryCode: "CH",
    countryName: "Switzerland",
    cantonCode: "VD",
    cantonName: "Vaud",
    municipality: "Prilly",
    postalCode: "1008",
    normalizedAddress: "1008 Prilly",
    latitude: 46.538,
    longitude: 6.605,
    precision: "locality",
    confidence: "high",
    reviewStatus: "verified",
    sourceUrl: "https://swissroc.ch/fr/projets/buissonniere-4/",
    sources: [
      {
        url: "https://swissroc.ch/fr/projets/buissonniere-4/",
        kind: "developer_site",
        note: "Swissroc official project page: Buissonnière 4 in Prilly.",
      },
      {
        url: "https://prilly-buissonniere4.ch/",
        kind: "official_project_site",
        note: "Official marketing site: residential project in Prilly.",
      },
      {
        url: "https://api3.geo.admin.ch/rest/services/api/SearchServer?searchText=1008&type=locations&origins=zipcode",
        kind: "municipal_mapping",
        note: "Swiss federal zipcode layer includes 1008 - Prilly. Street number is not taken from the project name.",
      },
    ],
    notes:
      "Street address is not recorded from the project name. Marketing listings mention Chemin de la Buissonnière 4 but that is not used for high-confidence backfill.",
  },
  {
    key: "residence-symbiose",
    displayName: "Résidence Symbiose",
    aliases: [
      "Résidence Symbiose",
      "Residence Symbiose",
      "Symbiose",
      "residence-symbiose",
    ],
    references: ["symbiose", "residence-symbiose"],
    shortReferences: [],
    countryCode: "CH",
    countryName: "Switzerland",
    cantonCode: "VD",
    cantonName: "Vaud",
    municipality: "Le Mont-sur-Lausanne",
    postalCode: "1052",
    normalizedAddress: "Chemin de Pernessy, 1052 Le Mont-sur-Lausanne",
    latitude: 46.559,
    longitude: 6.64,
    precision: "locality",
    confidence: "high",
    reviewStatus: "verified",
    sourceUrl: "https://residence-symbiose.ch/concepts/",
    sources: [
      {
        url: "https://residence-symbiose.ch/concepts/",
        kind: "official_project_site",
        note: "Official site copy: Chemin de Pernessy, Le Mont-sur-Lausanne, Suisse.",
      },
      {
        url: "https://evo-home.ch/en/",
        kind: "agency_portfolio",
        note: "EvoHome portfolio: Mont-sur-Lausanne, VD.",
      },
      {
        url: "https://api3.geo.admin.ch/rest/services/api/SearchServer?searchText=1052&type=locations&origins=zipcode",
        kind: "municipal_mapping",
        note: "Swiss federal zipcode layer: 1052 - Le Mont-sur-Lausanne. Official street spelling is Pernessy.",
      },
    ],
    notes: "Project-area street without a published house number.",
  },
  {
    key: "eleven-41",
    displayName: "Eleven 41",
    aliases: ["Eleven 41", "Eleven41", "1141", "1141 BC", "Eleven 41 Business Center"],
    references: ["eleven41", "1141"],
    shortReferences: [],
    countryCode: "JM",
    countryName: "Jamaica",
    cantonCode: null,
    cantonName: null,
    municipality: "Montego Bay",
    postalCode: null,
    normalizedAddress: "Montego Bay, Jamaica",
    latitude: null,
    longitude: null,
    precision: "locality",
    confidence: "high",
    reviewStatus: "verified",
    sourceUrl: "https://1141bc.com/",
    sources: [
      {
        url: "https://1141bc.com/",
        kind: "official_project_site",
        note: "Official site: Montego Bay logistics and business hub near Sangster International Airport and the Freeport.",
      },
      {
        url: "https://evo-home.ch/en/",
        kind: "agency_portfolio",
        note: "EvoHome portfolio lists Eleven 41 as Montego Bay, Jamaica.",
      },
    ],
    notes: "No published street number or official coordinates. Locality only.",
  },
  {
    key: "k2-apartments",
    displayName: "K2 Apartments",
    aliases: [
      "K2 Apartments",
      "K2",
      "Kingston Two",
      "Kingston 2 Apartments",
      "Kingston Two Apartments",
    ],
    references: ["k2", "k2apartments", "kingston2"],
    shortReferences: [],
    countryCode: "JM",
    countryName: "Jamaica",
    cantonCode: null,
    cantonName: null,
    municipality: "Kingston",
    postalCode: "Kingston 2",
    normalizedAddress: "Bournemouth Gardens, Kingston 2, Jamaica",
    latitude: null,
    longitude: null,
    precision: "locality",
    confidence: "high",
    reviewStatus: "verified",
    sourceUrl: "https://evo-home.ch/en/",
    sources: [
      {
        url: "https://evo-home.ch/en/",
        kind: "agency_portfolio",
        note: "EvoHome portfolio: 119-unit waterfront residences in Kingston, Jamaica.",
      },
      {
        url: "https://jamaica-gleaner.com/article/lead-stories/20231220/holness-takes-credit-environment-allowing-new-21b-kingston-2",
        kind: "authoritative_press",
        note: "Jamaica Gleaner: Kingston 2 / Bournemouth Gardens. Street number not used for high-confidence backfill.",
      },
    ],
    notes:
      "Distinct from unrelated K2 properties in Chicago or Hull. Jamaican waterfront project only.",
  },
  {
    key: "evohome-general",
    displayName: "EvoHome General",
    aliases: [
      "EvoHome General",
      "Evohome General",
      "EvoHome General Database",
      "Evohome General Database",
      "General",
    ],
    references: ["EVO-GENERAL", "evogeneral"],
    shortReferences: [],
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
    confidence: null,
    reviewStatus: "unresolved",
    sourceUrl: null,
    sources: [],
    notes:
      "Catch-all CRM scope, not a real-estate site. No geography is invented.",
  },
  {
    key: "crets-de-commugny",
    displayName: "Crêts de Commugny",
    aliases: [
      "Crêts de Commugny",
      "Crets de Commugny",
      "Les Crêts de Commugny",
      "Les Crets de Commugny",
    ],
    references: ["CRETS_DE_COMMUGNY", "cretsdecommugny"],
    shortReferences: [],
    countryCode: "CH",
    countryName: "Switzerland",
    cantonCode: "VD",
    cantonName: "Vaud",
    municipality: "Commugny",
    postalCode: "1291",
    normalizedAddress: "1291 Commugny",
    latitude: 46.324,
    longitude: 6.164,
    precision: "locality",
    confidence: "high",
    reviewStatus: "verified",
    sourceUrl: "https://cretsdecommugny.ch/",
    sources: [
      {
        url: "https://cretsdecommugny.ch/",
        kind: "official_project_site",
        note: "Official site: two villas in Commugny, Terre Sainte. Location is not inferred from the name alone.",
      },
      {
        url: "https://api3.geo.admin.ch/rest/services/api/SearchServer?searchText=1291&type=locations&origins=zipcode",
        kind: "municipal_mapping",
        note: "Swiss federal zipcode layer: 1291 - Commugny.",
      },
      {
        url: "https://api3.geo.admin.ch/rest/services/api/SearchServer?searchText=Commugny&type=locations&origins=gg25",
        kind: "municipal_mapping",
        note: "Official commune centroid rounded to 3 decimals (locality precision).",
      },
    ],
    notes: "No published street number. Locality-level Commugny only.",
  },
  {
    key: "tannay-horizon",
    displayName: "Tannay Horizon",
    aliases: ["Tannay Horizon", "Tannay Horizons"],
    references: ["TANNAYHORIZON", "tannayhorizon"],
    shortReferences: [],
    countryCode: "CH",
    countryName: "Switzerland",
    cantonCode: "VD",
    cantonName: "Vaud",
    municipality: "Tannay",
    postalCode: "1295",
    normalizedAddress: "1295 Tannay",
    latitude: 46.306,
    longitude: 6.187,
    precision: "locality",
    confidence: "high",
    reviewStatus: "verified",
    sourceUrl: "https://tannayhorizon.ch/",
    sources: [
      {
        url: "https://tannayhorizon.ch/",
        kind: "official_project_site",
        note: "Official project marketing site for Tannay Horizon.",
      },
      {
        url: "https://www.linkedin.com/company/tannay-horizon",
        kind: "official_project_site",
        note: "First-party project page: 16 apartments in Tannay, linking to tannayhorizon.ch.",
      },
      {
        url: "https://api3.geo.admin.ch/rest/services/api/SearchServer?searchText=1295&type=locations&origins=zipcode",
        kind: "municipal_mapping",
        note: "Swiss federal zipcode layer includes 1295 - Tannay (also 1295 - Mies). Tannay gg25 centroid is used, not Mies.",
      },
    ],
    notes:
      "PLZ 1295 is shared with Mies. Municipality is Tannay from first-party project copy, not from the shared postcode.",
  },
  {
    key: "namaya",
    displayName: "Namaya",
    aliases: ["Namaya", "Résidence Namaya", "Residence Namaya"],
    references: ["NAMAYA", "residencenamaya"],
    shortReferences: [],
    countryCode: "CH",
    countryName: "Switzerland",
    cantonCode: "VD",
    cantonName: "Vaud",
    municipality: "Rolle",
    postalCode: "1180",
    normalizedAddress: "Route du Lac, Rolle",
    latitude: 46.426,
    longitude: 6.349,
    precision: "locality",
    confidence: "high",
    reviewStatus: "verified",
    sourceUrl: "https://residence-namaya.ch/",
    sources: [
      {
        url: "https://residence-namaya.ch/",
        kind: "official_project_site",
        note: "Official site: Résidence NAMAYA in Rolle, on Route du Lac by Lake Geneva.",
      },
      {
        url: "https://api3.geo.admin.ch/rest/services/api/SearchServer?searchText=1180&type=locations&origins=zipcode",
        kind: "municipal_mapping",
        note: "Swiss federal zipcode layer includes 1180 - Rolle and 1180 - Tartegnin. Rolle is the municipality named by the developer.",
      },
      {
        url: "https://api3.geo.admin.ch/rest/services/api/SearchServer?searchText=Rolle&type=locations&origins=gg25",
        kind: "municipal_mapping",
        note: "Official Rolle commune centroid rounded to 3 decimals (locality precision).",
      },
    ],
    notes:
      "Street is Route du Lac without a published house number. Coordinates are Rolle commune centroid, not Tartegnin.",
  },
  {
    key: "eveil-epalinges",
    displayName: "Éveil",
    aliases: ["Éveil", "Eveil", "Éveil Epalinges", "Eveil Epalinges"],
    references: ["EVEIL", "eveilepalinges"],
    shortReferences: [],
    countryCode: "CH",
    countryName: "Switzerland",
    cantonCode: "VD",
    cantonName: "Vaud",
    municipality: "Epalinges",
    postalCode: "1066",
    normalizedAddress: "1066 Epalinges",
    latitude: 46.552,
    longitude: 6.672,
    precision: "locality",
    confidence: "high",
    reviewStatus: "verified",
    sourceUrl: "https://eveil-epalinges.ch/",
    sources: [
      {
        url: "https://eveil-epalinges.ch/",
        kind: "official_project_site",
        note: "Official site title and copy: Éveil at Epalinges, above Lausanne.",
      },
      {
        url: "https://api3.geo.admin.ch/rest/services/api/SearchServer?searchText=1066&type=locations&origins=zipcode",
        kind: "municipal_mapping",
        note: "Swiss federal zipcode layer: 1066 - Epalinges.",
      },
    ],
    notes: "Quarter-scale development. No published street used for backfill.",
  },
  {
    key: "vista-brent",
    displayName: "Vista Brent",
    aliases: [
      "Vista Brent",
      "Vista Brent / Taquà",
      "Vista Brent / Taqua",
      "Vista Brent Taquà",
      "Le Taquà",
      "Taquà",
    ],
    references: ["VISTABRENT", "vistabrent", "taqua"],
    shortReferences: [],
    countryCode: "CH",
    countryName: "Switzerland",
    cantonCode: "VD",
    cantonName: "Vaud",
    municipality: "Brent",
    postalCode: "1817",
    normalizedAddress: "Brent, 1817 Montreux",
    latitude: 46.455,
    longitude: 6.903,
    precision: "locality",
    confidence: "high",
    reviewStatus: "verified",
    sourceUrl: "https://swissroc.ch/fr/projets/vista/",
    sources: [
      {
        url: "https://swissroc.ch/fr/projets/vista/",
        kind: "developer_site",
        note: "Swissroc official project page: Vista on the heights of Montreux, at Brent. Also lists vista-brent-montreux.ch.",
      },
      {
        url: "https://www.montreux.ch/habiter-et-decouvrir/villages/brent",
        kind: "municipal_mapping",
        note: "Commune of Montreux: Brent is a village in the commune, not a separate municipality.",
      },
      {
        url: "https://api3.geo.admin.ch/rest/services/api/SearchServer?searchText=1817&type=locations&origins=zipcode",
        kind: "municipal_mapping",
        note: "Swiss federal zipcode layer: 1817 - Brent. Coordinates are the Brent zipcode locality, not the wider Montreux centroid.",
      },
    ],
    notes:
      "Locality is Brent (PLZ 1817) inside the commune of Montreux. Manual city 'Montreux' is treated as a broader region, not a conflict.",
  },
  {
    key: "domaine-du-lac-nyon",
    displayName: "Domaine du Lac",
    aliases: ["Domaine du Lac", "Le Domaine du Lac", "Domaine du Lac Nyon"],
    references: ["DOMAINEDULAC", "domainedulac"],
    shortReferences: [],
    countryCode: "CH",
    countryName: "Switzerland",
    cantonCode: "VD",
    cantonName: "Vaud",
    municipality: "Nyon",
    postalCode: "1260",
    normalizedAddress: "1260 Nyon",
    latitude: 46.383,
    longitude: 6.233,
    precision: "locality",
    confidence: "high",
    reviewStatus: "verified",
    sourceUrl: "https://www.halter.ch/en/projects/domaine-du-lac",
    sources: [
      {
        url: "https://www.halter.ch/en/projects/domaine-du-lac",
        kind: "developer_site",
        note: "Halter official project page: Domaine du Lac, Nyon, on the shores of Lake Geneva.",
      },
      {
        url: "https://api3.geo.admin.ch/rest/services/api/SearchServer?searchText=1260&type=locations&origins=zipcode",
        kind: "municipal_mapping",
        note: "Swiss federal zipcode layer: 1260 - Nyon.",
      },
    ],
    notes:
      "Applied only to the Halter / Swissroc Domaine du Lac in Nyon. A conflicting specific city is not overwritten.",
  },
  {
    key: "bochet-thonex",
    displayName: "Bochet",
    aliases: [
      "Bochet",
      "Pierre à Bochet",
      "Pierre-à-Bochet",
      "Pierre à Bochet 17",
    ],
    references: ["BOCHET", "pierreabochet"],
    shortReferences: [],
    countryCode: "CH",
    countryName: "Switzerland",
    cantonCode: "GE",
    cantonName: "Genève",
    municipality: "Thônex",
    postalCode: "1226",
    normalizedAddress: "Pierre-à-Bochet, 1226 Thônex",
    latitude: 46.195,
    longitude: 6.208,
    precision: "locality",
    confidence: "high",
    reviewStatus: "verified",
    sourceUrl: "https://swissroc.ch/fr/projets/pierre-a-bochet-17/",
    sources: [
      {
        url: "https://swissroc.ch/fr/projets/pierre-a-bochet-17/",
        kind: "developer_site",
        note: "Swissroc official project page: Pierre à Bochet 17 in Thônex.",
      },
      {
        url: "https://pierre-bochet17.ch/",
        kind: "official_project_site",
        note: "Official marketing site: residence at Thônex, Pierre-à-Bochet.",
      },
      {
        url: "https://api3.geo.admin.ch/rest/services/api/SearchServer?searchText=Th%C3%B4nex&type=locations&origins=gg25",
        kind: "municipal_mapping",
        note: "Official commune centroid for Thônex (GE), PLZ 1226.",
      },
    ],
    notes:
      "CRM name Bochet is the Pierre-à-Bochet locality in Thônex, confirmed by the official project/developer sites. Street number 17 is not used as a coordinate.",
  },
  {
    key: "ormet-ecublens",
    displayName: "Ormet",
    aliases: ["Ormet", "Ormet 68"],
    references: ["ORMET", "ormet68"],
    shortReferences: [],
    countryCode: "CH",
    countryName: "Switzerland",
    cantonCode: "VD",
    cantonName: "Vaud",
    municipality: "Ecublens",
    postalCode: "1024",
    normalizedAddress: "Ormet, 1024 Ecublens",
    latitude: 46.529,
    longitude: 6.557,
    precision: "locality",
    confidence: "high",
    reviewStatus: "verified",
    sourceUrl: "https://ormet68.ch/",
    sources: [
      {
        url: "https://ormet68.ch/",
        kind: "official_project_site",
        note: "Official site: four villas in Ecublens. Street number 68 is not used as a coordinate.",
      },
      {
        url: "https://swissroc.ch/fr/projets/ormet-68/",
        kind: "developer_site",
        note: "Swissroc official project page: Ormet 68 in Ecublens, near EPFL/UNIL.",
      },
      {
        url: "https://api3.geo.admin.ch/rest/services/api/SearchServer?searchText=Ecublens&type=locations&origins=gg25",
        kind: "municipal_mapping",
        note: "Official commune centroid for Ecublens (VD), PLZ 1024.",
      },
    ],
    notes: "CRM name Ormet is the official Ormet 68 project in Ecublens.",
  },
];

export function catalogMatchKeys(entry: ProjectLocationCatalogEntry): string[] {
  return [...entry.aliases, ...entry.references, entry.displayName, entry.key]
    .map(compactLocationKey)
    .filter(Boolean);
}

export function findCatalogEntryByKey(
  key: string,
): ProjectLocationCatalogEntry | undefined {
  return PROJECT_LOCATION_CATALOG.find((entry) => entry.key === key);
}

export function catalogCoverageSummary(): {
  total: number;
  highConfidence: number;
  unresolved: number;
  keys: string[];
} {
  const highConfidence = PROJECT_LOCATION_CATALOG.filter(
    (entry) => entry.confidence === "high" && entry.reviewStatus === "verified",
  );
  const unresolved = PROJECT_LOCATION_CATALOG.filter(
    (entry) => entry.reviewStatus !== "verified",
  );
  return {
    total: PROJECT_LOCATION_CATALOG.length,
    highConfidence: highConfidence.length,
    unresolved: unresolved.length,
    keys: PROJECT_LOCATION_CATALOG.map((entry) => entry.key),
  };
}
