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

  it("does not guess a commune-named project such as Veyrier", () => {
    const decision = decideProjectLocationEnrichment({
      name: "Veyrier",
      reference: "VEYRIER",
    });
    expect(decision.action).toBe("skip");
    expect(decision.reason).toBe("no_match");
    expect(decision.location.municipality).toBeNull();
  });
});
