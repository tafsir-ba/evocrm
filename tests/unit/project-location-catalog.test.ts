import { describe, expect, it } from "vitest";

import {
  PROJECT_LOCATION_CATALOG,
  catalogCoverageSummary,
  findCatalogEntryByKey,
} from "@/lib/project-location-catalog";

describe("project location catalog", () => {
  it("records Grosvenor Vistas in Jamaica with no Swiss canton", () => {
    const entry = findCatalogEntryByKey("grosvenor-vistas");
    expect(entry?.countryCode).toBe("JM");
    expect(entry?.countryName).toBe("Jamaica");
    expect(entry?.municipality).toBe("Kingston");
    expect(entry?.postalCode).toBe("Kingston 8");
    expect(entry?.cantonCode).toBeNull();
    expect(entry?.sourceUrl).toBe("https://grosvenorvistas.com/");
    expect(entry?.confidence).toBe("high");
  });

  it("keeps only evidence-backed high-confidence geography for Swiss projects", () => {
    expect(findCatalogEntryByKey("v77")?.municipality).toBe("Vandœuvres");
    expect(findCatalogEntryByKey("v77")?.postalCode).toBe("1253");
    expect(findCatalogEntryByKey("le-parc-des-crets")?.municipality).toBe("Troinex");
    expect(findCatalogEntryByKey("residence-les-pins")?.municipality).toBe("Confignon");
    expect(findCatalogEntryByKey("arbora")?.municipality).toBe("Crissier");
    expect(findCatalogEntryByKey("arbora")?.cantonCode).toBe("VD");
    expect(findCatalogEntryByKey("defne")?.municipality).toBe("Rolle");
    expect(findCatalogEntryByKey("smarthill")?.municipality).toBe("Crissier");
    expect(findCatalogEntryByKey("villa-sorella")?.municipality).toBe("Corsier");
    expect(findCatalogEntryByKey("villa-sorella")?.cantonCode).toBe("GE");
    expect(findCatalogEntryByKey("jardins-pala")?.municipality).toBe("Bulle");
    expect(findCatalogEntryByKey("jardins-pala")?.cantonCode).toBe("FR");
    expect(findCatalogEntryByKey("rubix")?.municipality).toBe("Satigny");
    expect(findCatalogEntryByKey("buissonniere-4")?.municipality).toBe("Prilly");
    expect(findCatalogEntryByKey("residence-symbiose")?.municipality).toBe(
      "Le Mont-sur-Lausanne",
    );
    expect(findCatalogEntryByKey("crets-de-commugny")?.municipality).toBe("Commugny");
    expect(findCatalogEntryByKey("crets-de-commugny")?.postalCode).toBe("1291");
    expect(findCatalogEntryByKey("tannay-horizon")?.municipality).toBe("Tannay");
    expect(findCatalogEntryByKey("namaya")?.municipality).toBe("Rolle");
    expect(findCatalogEntryByKey("eveil-epalinges")?.municipality).toBe("Epalinges");
    expect(findCatalogEntryByKey("vista-brent")?.municipality).toBe("Brent");
    expect(findCatalogEntryByKey("vista-brent")?.postalCode).toBe("1817");
    expect(findCatalogEntryByKey("domaine-du-lac-nyon")?.municipality).toBe("Nyon");
    expect(findCatalogEntryByKey("bochet-thonex")?.municipality).toBe("Thônex");
    expect(findCatalogEntryByKey("ormet-ecublens")?.municipality).toBe("Ecublens");
    expect(findCatalogEntryByKey("avant-scene")?.municipality).toBe("Neuchâtel");
    expect(findCatalogEntryByKey("avant-scene")?.cantonCode).toBe("NE");
    expect(findCatalogEntryByKey("cressy")?.municipality).toBe("Confignon");
    expect(findCatalogEntryByKey("floreal")?.municipality).toBe("Ecublens");
    expect(findCatalogEntryByKey("campanules")?.municipality).toBe("Gollion");
    expect(findCatalogEntryByKey("bc-kingston")?.countryCode).toBe("JM");
    expect(findCatalogEntryByKey("bc-kingston")?.municipality).toBe("Kingston");
    expect(findCatalogEntryByKey("bc-kingston")?.cantonCode).toBeNull();
  });

  it("does not invent a street for Buissonnière 4 from the project name", () => {
    const entry = findCatalogEntryByKey("buissonniere-4");
    expect(entry?.normalizedAddress).toBe("1008 Prilly");
    expect(entry?.normalizedAddress).not.toMatch(/chemin/i);
  });

  it("records user-confirmed provenance on operator-provided rows", () => {
    for (const key of [
      "residence-les-pins",
      "arbora",
      "avant-scene",
      "bc-kingston",
      "cressy",
      "floreal",
      "campanules",
    ]) {
      const entry = findCatalogEntryByKey(key);
      expect(entry?.confirmation).toBe("user");
      expect(entry?.sources.some((source) => source.kind === "user_confirmed")).toBe(
        true,
      );
    }
  });

  it("keeps user-confirmed Cressy and BC Kingston on exact keys only", () => {
    const cressy = findCatalogEntryByKey("cressy");
    expect(cressy?.aliases).toEqual(["Cressy"]);
    expect(cressy?.references).toEqual(["CRESSY"]);
    expect(cressy?.municipality).toBe("Confignon");

    const kingston = findCatalogEntryByKey("bc-kingston");
    expect(kingston?.aliases).toEqual(["BC Kingston"]);
    expect(kingston?.references).toEqual(["BC_KINGSTON"]);
    expect(kingston?.countryCode).toBe("JM");
    expect(kingston?.postalCode).toBeNull();
  });

  it("places Villa Sorella in Corsier GE, not Corsier-sur-Vevey", () => {
    const entry = findCatalogEntryByKey("villa-sorella");
    expect(entry?.cantonCode).toBe("GE");
    expect(entry?.municipality).toBe("Corsier");
    expect(entry?.postalCode).toBe("1246");
    expect(entry?.municipality).not.toBe("Corsier-sur-Vevey");
  });

  it("places Rubix in Satigny from the published address, not Meyrin", () => {
    const entry = findCatalogEntryByKey("rubix");
    expect(entry?.municipality).toBe("Satigny");
    expect(entry?.postalCode).toBe("1242");
    expect(entry?.cantonCode).toBe("GE");
    expect(entry?.municipality).not.toBe("Meyrin");
  });

  it("leaves EvoHome General unresolved", () => {
    const entry = findCatalogEntryByKey("evohome-general");
    expect(entry?.reviewStatus).toBe("unresolved");
    expect(entry?.countryCode).toBeNull();
    expect(entry?.municipality).toBeNull();
  });

  it("requires a source URL on every high-confidence entry", () => {
    const high = PROJECT_LOCATION_CATALOG.filter((entry) => entry.confidence === "high");
    expect(high.length).toBeGreaterThan(0);
    for (const entry of high) {
      expect(entry.sources.length).toBeGreaterThan(0);
      if (entry.confirmation === "user") {
        expect(entry.sources.some((source) => source.kind === "user_confirmed")).toBe(
          true,
        );
        if (entry.sourceUrl) {
          expect(entry.sourceUrl).toMatch(/^https:\/\//);
        }
      } else {
        expect(entry.sourceUrl).toMatch(/^https:\/\//);
      }
    }
  });

  it("summarizes catalog coverage", () => {
    const summary = catalogCoverageSummary();
    expect(summary.total).toBe(PROJECT_LOCATION_CATALOG.length);
    expect(summary.highConfidence).toBe(27);
    expect(summary.unresolved).toBe(1);
  });
});
