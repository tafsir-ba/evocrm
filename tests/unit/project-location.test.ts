import { describe, expect, it } from "vitest";

import {
  emptyProjectLocation,
  formatProjectLocationDetail,
  formatProjectLocationLabel,
  formatStructuredProjectLocation,
  normalizeProjectLocation,
  roundCoordinate,
  toProjectLocationWriteInput,
} from "@/lib/project-location";

describe("project location model", () => {
  it("formats Swiss locality as municipality and canton, not a single string dump", () => {
    const location = emptyProjectLocation({
      countryCode: "CH",
      countryName: "Switzerland",
      cantonCode: "GE",
      cantonName: "Genève",
      municipality: "Vandœuvres",
      postalCode: "1253",
      precision: "locality",
    });

    expect(formatStructuredProjectLocation(location)).toBe("Vandœuvres, Genève");
    expect(formatProjectLocationLabel(location, { city: "Geneva", country: "Switzerland" })).toBe(
      "Vandœuvres, Genève",
    );
  });

  it("keeps Grosvenor Vistas as Kingston 8, Jamaica", () => {
    const location = emptyProjectLocation({
      countryCode: "JM",
      countryName: "Jamaica",
      municipality: "Kingston",
      postalCode: "Kingston 8",
      normalizedAddress: "3A Grosvenor Heights, Manor Park, Kingston 8, Jamaica",
      precision: "address",
    });

    expect(formatStructuredProjectLocation(location)).toBe("Kingston 8, Jamaica");
    expect(formatProjectLocationDetail(location)).toBe(
      "3A Grosvenor Heights, Manor Park, Kingston 8, Jamaica",
    );
    expect(location.countryCode).not.toBe("CH");
    expect(location.cantonCode).toBeNull();
  });

  it("falls back to manual city/country when structured location is unknown", () => {
    expect(
      formatProjectLocationLabel(emptyProjectLocation(), {
        city: "Genève",
        country: "Suisse",
      }),
    ).toBe("Genève, Suisse");
  });

  it("rounds coordinates to documented precision and drops them when unknown", () => {
    expect(roundCoordinate(46.22005081176758, "locality")).toBe(46.22);
    expect(roundCoordinate(6.194608688354492, "address")).toBe(6.19461);
    expect(roundCoordinate(46.22, "unknown")).toBeNull();
  });

  it("normalizes ISO country and Swiss canton codes", () => {
    const location = normalizeProjectLocation({
      countryCode: "ch",
      cantonCode: "vd",
      municipality: "Prilly",
      precision: "locality",
      latitude: 46.53825378417969,
      longitude: 6.604588985443115,
    });

    expect(location.countryCode).toBe("CH");
    expect(location.countryName).toBe("Switzerland");
    expect(location.cantonCode).toBe("VD");
    expect(location.cantonName).toBe("Vaud");
    expect(location.latitude).toBe(46.538);
    expect(location.longitude).toBe(6.605);
  });

  it("omits provenance from API write payloads", () => {
    const location = emptyProjectLocation({
      countryCode: "CH",
      countryName: "Switzerland",
      cantonCode: "GE",
      cantonName: "Genève",
      municipality: "Petit Saconnex",
      postalCode: "1209",
      reviewStatus: "verified",
      provenance: {
        method: "user_confirmed",
        catalogKey: "petit-saconnex",
        appliedAt: "2026-08-01T00:00:00.000Z",
        previousManual: null,
        notes: "Operator confirmed.",
      },
    });

    const payload = toProjectLocationWriteInput(location);

    expect(payload).toMatchObject({
      countryCode: "CH",
      cantonCode: "GE",
      municipality: "Petit Saconnex",
      postalCode: "1209",
    });
    expect(payload && "provenance" in payload).toBe(false);
  });
});
