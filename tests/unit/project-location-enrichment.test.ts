import { describe, expect, it } from "vitest";

import { emptyProjectLocation } from "@/lib/project-location";
import {
  decideProjectLocationEnrichment,
  matchProjectLocationCatalog,
} from "@/lib/project-location-enrichment";

describe("project location enrichment", () => {
  it("matches Grosvenor Vistas / GV to Jamaica instead of assuming Swiss", () => {
    const byName = matchProjectLocationCatalog({ name: "Grosvenor Vistas" });
    expect(byName.status).toBe("matched");
    if (byName.status === "matched") {
      expect(byName.entry.countryCode).toBe("JM");
      expect(byName.entry.cantonCode).toBeNull();
    }

    const byShortRef = matchProjectLocationCatalog({
      name: "Grosvenor Vistas",
      reference: "GV",
    });
    expect(byShortRef.status).toBe("matched");
  });

  it("does not treat Green View / GV as Grosvenor", () => {
    const match = matchProjectLocationCatalog({
      name: "Green View",
      reference: "GV",
    });
    expect(match.status).toBe("unresolved");
    expect(match.reason).toBe("no_match");
  });

  it("does not guess a location from an unknown project name", () => {
    const decision = decideProjectLocationEnrichment({
      name: "Sunset Villas",
      city: null,
      country: null,
    });
    expect(decision.action).toBe("skip");
    expect(decision.reason).toBe("no_match");
    expect(decision.location.countryCode).toBeNull();
    expect(decision.location.municipality).toBeNull();
  });

  it("backfills empty display fields for a high-confidence Swiss project", () => {
    const decision = decideProjectLocationEnrichment({
      name: "V77",
      reference: "v77",
      city: null,
      country: null,
    });

    expect(decision.action).toBe("apply");
    expect(decision.location.countryCode).toBe("CH");
    expect(decision.location.cantonCode).toBe("GE");
    expect(decision.location.municipality).toBe("Vandœuvres");
    expect(decision.city).toBe("Vandœuvres");
    expect(decision.country).toBe("Switzerland");
    expect(decision.overwrittenManual).toBe(false);
  });

  it("preserves a compatible manual city and only fills structured fields", () => {
    const decision = decideProjectLocationEnrichment({
      name: "Le Parc des Crêts",
      reference: "LEPARCDESCRETS",
      address: "Gatehouse notes",
      city: "Troinex",
      country: "Suisse",
    });

    expect(decision.action).toBe("apply");
    expect(decision.city).toBe("Troinex");
    expect(decision.country).toBe("Suisse");
    expect(decision.address).toBe("Gatehouse notes");
    expect(decision.location.postalCode).toBe("1256");
  });

  it("corrects a clearly wrong Swiss country on Grosvenor Vistas and keeps provenance", () => {
    const decision = decideProjectLocationEnrichment(
      {
        name: "Grosvenor Vistas",
        reference: "GV",
        city: "Geneva",
        country: "Switzerland",
      },
      { appliedAt: "2026-08-30T00:00:00.000Z" },
    );

    expect(decision.action).toBe("apply");
    expect(decision.reason).toBe("high_confidence_country_correction");
    expect(decision.overwrittenManual).toBe(true);
    expect(decision.country).toBe("Jamaica");
    expect(decision.city).toBe("Kingston");
    expect(decision.location.countryCode).toBe("JM");
    expect(decision.location.provenance?.previousManual).toEqual({
      address: null,
      city: "Geneva",
      country: "Switzerland",
    });
  });

  it("applies user-confirmed Confignon for Résidence les Pins", () => {
    const decision = decideProjectLocationEnrichment({
      name: "Résidence les Pins",
    });

    expect(decision.action).toBe("apply");
    expect(decision.reason).toBe("user_confirmed");
    expect(decision.location.municipality).toBe("Confignon");
    expect(decision.location.cantonCode).toBe("GE");
    expect(decision.location.countryCode).toBe("CH");
    expect(decision.location.provenance?.method).toBe("user_confirmed");
    expect(decision.location.provenance?.catalogKey).toBe("residence-les-pins");
  });

  it("applies user-confirmed Crissier for Arbora", () => {
    const decision = decideProjectLocationEnrichment({
      name: "Arbora",
    });

    expect(decision.action).toBe("apply");
    expect(decision.reason).toBe("user_confirmed");
    expect(decision.location.municipality).toBe("Crissier");
    expect(decision.location.cantonCode).toBe("VD");
    expect(decision.location.countryCode).toBe("CH");
    expect(decision.location.postalCode).toBe("1023");
    expect(decision.location.provenance?.method).toBe("user_confirmed");
    expect(decision.location.provenance?.catalogKey).toBe("arbora");
  });

  it("refines a broader Geneva city to the evidenced municipality", () => {
    const decision = decideProjectLocationEnrichment({
      name: "Résidence les Pins",
      city: "Geneva",
      country: "Switzerland",
    });

    expect(decision.action).toBe("apply");
    expect(decision.reason).toBe("high_confidence_locality_refinement");
    expect(decision.city).toBe("Confignon");
    expect(decision.location.municipality).toBe("Confignon");
    expect(decision.location.provenance?.method).toBe("user_confirmed");
  });

  it("places researched promotions without inventing streets", () => {
    const defne = decideProjectLocationEnrichment({ name: "Defne" });
    expect(defne.action).toBe("apply");
    expect(defne.location.municipality).toBe("Rolle");
    expect(defne.location.provenance?.method).toBe("enrichment");

    const smarthill = decideProjectLocationEnrichment({ name: "Smarthill" });
    expect(smarthill.location.municipality).toBe("Crissier");
    expect(smarthill.location.cantonCode).toBe("VD");

    const sorella = decideProjectLocationEnrichment({ name: "Villa Sorella" });
    expect(sorella.location.municipality).toBe("Corsier");
    expect(sorella.location.cantonCode).toBe("GE");
    expect(sorella.location.municipality).not.toBe("Corsier-sur-Vevey");

    const pala = decideProjectLocationEnrichment({ name: "Jardins Pala" });
    expect(pala.location.municipality).toBe("Bulle");
    expect(pala.location.cantonCode).toBe("FR");

    const rubix = decideProjectLocationEnrichment({ name: "Rubix" });
    expect(rubix.location.municipality).toBe("Satigny");
    expect(rubix.location.municipality).not.toBe("Meyrin");
  });

  it("does not overwrite a conflicting specific manual city", () => {
    const decision = decideProjectLocationEnrichment({
      name: "V77",
      city: "Cologny",
      country: "Switzerland",
    });

    expect(decision.action).toBe("review");
    expect(decision.reason).toBe("manual_city_conflict");
    expect(decision.city).toBe("Cologny");
    expect(decision.location.municipality).toBeNull();
    expect(decision.location.reviewStatus).toBe("review_needed");
  });

  it("preserves an existing manual structured location", () => {
    const decision = decideProjectLocationEnrichment({
      name: "V77",
      location: emptyProjectLocation({
        countryCode: "CH",
        municipality: "Manual village",
        precision: "address",
        reviewStatus: "verified",
        provenance: {
          method: "manual",
          catalogKey: null,
          appliedAt: "2026-01-01T00:00:00.000Z",
          previousManual: null,
          notes: null,
        },
      }),
    });

    expect(decision.action).toBe("skip");
    expect(decision.reason).toBe("manual_structured_location_preserved");
    expect(decision.location.municipality).toBe("Manual village");
  });

  it("flags EvoHome General as review-needed without inventing geography", () => {
    const decision = decideProjectLocationEnrichment({
      name: "EvoHome General",
      reference: "EVO-GENERAL",
    });

    expect(decision.action).toBe("review");
    expect(decision.location.reviewStatus).toBe("review_needed");
    expect(decision.location.countryCode).toBeNull();
    expect(decision.location.municipality).toBeNull();
  });

  it("matches EvoHome General Database as the same unresolved catch-all", () => {
    const decision = decideProjectLocationEnrichment({
      name: "EvoHome General Database",
      reference: "EVO-GENERAL",
    });

    expect(decision.action).toBe("review");
    expect(decision.reason).toBe("catalog_unresolved");
    expect(decision.location.countryCode).toBeNull();
  });

  it("matches Buissonnière Rockwell to the evidenced Prilly project", () => {
    const match = matchProjectLocationCatalog({
      name: "Buissonnière Rockwell",
      reference: "BUISSONNIERE_ROCKWELL",
    });
    expect(match.status).toBe("matched");
    if (match.status === "matched") {
      expect(match.entry.key).toBe("buissonniere-4");
      expect(match.entry.municipality).toBe("Prilly");
    }
  });

  it("places Bochet in Thônex from the official Pierre-à-Bochet project", () => {
    const decision = decideProjectLocationEnrichment({
      name: "Bochet",
      reference: "BOCHET",
    });
    expect(decision.action).toBe("apply");
    expect(decision.location.municipality).toBe("Thônex");
    expect(decision.location.cantonCode).toBe("GE");
    expect(decision.location.normalizedAddress).toMatch(/Pierre-à-Bochet/i);
  });

  it("places Vista Brent / Taquà in Brent, Vaud, not Geneva", () => {
    const decision = decideProjectLocationEnrichment({
      name: "Vista Brent / Taquà",
      reference: "VISTABRENT",
    });
    expect(decision.action).toBe("apply");
    expect(decision.location.countryCode).toBe("CH");
    expect(decision.location.cantonCode).toBe("VD");
    expect(decision.location.municipality).toBe("Brent");
    expect(decision.location.postalCode).toBe("1817");
  });

  it("verifies a commune-named project against official Swiss maps", () => {
    const decision = decideProjectLocationEnrichment({
      name: "Veyrier",
      reference: "VEYRIER",
    });
    expect(decision.action).toBe("apply");
    expect(decision.reason).toBe("verified_place_signal");
    expect(decision.location.countryCode).toBe("CH");
    expect(decision.location.cantonCode).toBe("GE");
    expect(decision.location.municipality).toBe("Veyrier");
    expect(decision.location.postalCode).toBe("1255");
    expect(decision.location.precision).toBe("locality");
  });

  it("treats Gland (Cardis) as the official commune of Gland, not a guess", () => {
    const decision = decideProjectLocationEnrichment({
      name: "Gland (Cardis)",
      reference: "GLAND_CARDIS",
    });
    expect(decision.action).toBe("apply");
    expect(decision.location.municipality).toBe("Gland");
    expect(decision.location.cantonCode).toBe("VD");
  });

  it("verifies TDL Pully, Corsier-sur-Vevey, and Collex-Bossy as official communes", () => {
    expect(decideProjectLocationEnrichment({ name: "TDL Pully" }).location.municipality).toBe(
      "Pully",
    );
    expect(
      decideProjectLocationEnrichment({ name: "Corsier-sur-Vevey" }).location.cantonCode,
    ).toBe("VD");
    expect(
      decideProjectLocationEnrichment({ name: "Collex-Bossy" }).location.municipality,
    ).toBe("Collex-Bossy");
  });

  it("leaves Cressy as review-needed because the quartier spans several communes", () => {
    const decision = decideProjectLocationEnrichment({
      name: "Cressy",
      reference: "CRESSY",
    });
    expect(decision.action).toBe("review");
    expect(decision.reason).toBe("ambiguous_place_signal");
    expect(decision.location.municipality).toBeNull();
    expect(decision.location.reviewStatus).toBe("review_needed");
  });

  it("does not assume BC Kingston is Swiss or Jamaican without project evidence", () => {
    const decision = decideProjectLocationEnrichment({
      name: "BC Kingston",
      reference: "BC_KINGSTON",
    });
    expect(decision.action).toBe("review");
    expect(decision.reason).toBe("ambiguous_place_signal");
    expect(decision.location.countryCode).toBeNull();
  });
});
