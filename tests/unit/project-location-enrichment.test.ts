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

  it("applies user-confirmed Confignon only to the Cressy / CRESSY row", () => {
    const decision = decideProjectLocationEnrichment({
      name: "Cressy",
      reference: "CRESSY",
    });
    expect(decision.action).toBe("apply");
    expect(decision.reason).toBe("user_confirmed");
    expect(decision.location.municipality).toBe("Confignon");
    expect(decision.location.cantonCode).toBe("GE");
    expect(decision.location.provenance?.method).toBe("user_confirmed");
    expect(decision.location.provenance?.catalogKey).toBe("cressy");
  });

  it("does not apply Cressy confirmation to Cressier or other Cressy-named projects", () => {
    const cressier = decideProjectLocationEnrichment({
      name: "Cressier",
      reference: "CRESSIER",
    });
    expect(cressier.location.provenance?.catalogKey).not.toBe("cressy");
    expect(cressier.location.municipality).not.toBe("Confignon");

    const longer = decideProjectLocationEnrichment({
      name: "Cressy Residences",
      reference: "CRESSY_RESIDENCES",
    });
    expect(longer.action).not.toBe("apply");
    expect(longer.location.municipality).toBeNull();
  });

  it("applies user-confirmed Kingston, Jamaica only to BC Kingston", () => {
    const decision = decideProjectLocationEnrichment({
      name: "BC Kingston",
      reference: "BC_KINGSTON",
    });
    expect(decision.action).toBe("apply");
    expect(decision.reason).toBe("user_confirmed");
    expect(decision.location.countryCode).toBe("JM");
    expect(decision.location.municipality).toBe("Kingston");
    expect(decision.location.cantonCode).toBeNull();
    expect(decision.location.provenance?.method).toBe("user_confirmed");
    expect(decision.location.provenance?.catalogKey).toBe("bc-kingston");
  });

  it("does not treat a bare Kingston name or other Kingston projects as BC Kingston", () => {
    const bare = decideProjectLocationEnrichment({
      name: "Kingston",
      reference: "KINGSTON",
    });
    expect(bare.action).toBe("review");
    expect(bare.reason).toBe("ambiguous_place_signal");
    expect(bare.location.countryCode).toBeNull();

    const grosvenor = decideProjectLocationEnrichment({
      name: "Grosvenor Vistas",
      reference: "GV",
    });
    expect(grosvenor.location.provenance?.catalogKey).toBe("grosvenor-vistas");
    expect(grosvenor.location.postalCode).toBe("Kingston 8");

    const k2 = decideProjectLocationEnrichment({ name: "K2", reference: "K2" });
    expect(k2.location.provenance?.catalogKey).toBe("k2-apartments");
  });

  it("applies the remaining user-confirmed rows on exact name/reference only", () => {
    const avant = decideProjectLocationEnrichment({
      name: "Avant-Scène",
      reference: "AVANTSCENE",
    });
    expect(avant.action).toBe("apply");
    expect(avant.reason).toBe("user_confirmed");
    expect(avant.location.municipality).toBe("Neuchâtel");
    expect(avant.location.cantonCode).toBe("NE");
    expect(avant.location.provenance?.method).toBe("user_confirmed");

    const floreal = decideProjectLocationEnrichment({
      name: "Floréal",
      reference: "FLOREAL",
    });
    expect(floreal.location.municipality).toBe("Ecublens");
    expect(floreal.location.cantonCode).toBe("VD");
    expect(floreal.location.provenance?.catalogKey).toBe("floreal");

    const ormet = decideProjectLocationEnrichment({
      name: "Ormet",
      reference: "ORMET",
    });
    expect(ormet.location.provenance?.catalogKey).toBe("ormet-ecublens");

    const campanules = decideProjectLocationEnrichment({
      name: "Campanules",
      reference: "CAMPANULES",
    });
    expect(campanules.location.municipality).toBe("Gollion");
    expect(campanules.location.cantonCode).toBe("VD");

    const lesCampanules = decideProjectLocationEnrichment({
      name: "Les Campanules",
      reference: "LES_CAMPANULES",
    });
    expect(lesCampanules.location.provenance?.catalogKey).not.toBe("campanules");
    expect(lesCampanules.action).not.toBe("apply");
  });
});
