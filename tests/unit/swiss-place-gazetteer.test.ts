import { describe, expect, it } from "vitest";

import { extractPlaceSignal } from "@/lib/swiss-place-gazetteer";

describe("swiss place gazetteer", () => {
  it("extracts official communes from exact names and qualified titles", () => {
    expect(extractPlaceSignal("Veyrier").status).toBe("verified");
    expect(extractPlaceSignal("Gland (Evo)", "GLAND_EVO")).toMatchObject({
      status: "verified",
      place: { municipality: "Gland", cantonCode: "VD" },
    });
    expect(extractPlaceSignal("Aquarelle Chardonne").status).toBe("verified");
    expect(extractPlaceSignal("Visp Litterna").status).toBe("verified");
    expect(extractPlaceSignal("Mathod").status).toBe("verified");
  });

  it("does not treat Cressy as Cressier or a single Geneva commune", () => {
    const match = extractPlaceSignal("Cressy", "CRESSY");
    expect(match.status).toBe("ambiguous");
    if (match.status === "ambiguous") {
      expect(match.signal.key).toBe("cressy");
    }
  });

  it("does not invent a place from a brand-only name", () => {
    expect(extractPlaceSignal("Sunset Villas").status).toBe("none");
    expect(extractPlaceSignal("The View", "THE_VIEW").status).toBe("none");
  });
});
