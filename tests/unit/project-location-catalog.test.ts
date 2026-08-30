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
  });

  it("does not invent a street for Buissonnière 4 from the project name", () => {
    const entry = findCatalogEntryByKey("buissonniere-4");
    expect(entry?.normalizedAddress).toBe("1008 Prilly");
    expect(entry?.normalizedAddress).not.toMatch(/chemin/i);
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
      expect(entry.sourceUrl).toMatch(/^https:\/\//);
      expect(entry.sources.length).toBeGreaterThan(0);
    }
  });

  it("summarizes catalog coverage", () => {
    const summary = catalogCoverageSummary();
    expect(summary.total).toBe(PROJECT_LOCATION_CATALOG.length);
    expect(summary.highConfidence).toBe(14);
    expect(summary.unresolved).toBe(1);
  });
});
