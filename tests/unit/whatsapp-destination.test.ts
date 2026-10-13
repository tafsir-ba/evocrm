import { describe, expect, it } from "vitest";

import { whatsappHref } from "@/lib/leads-table";
import {
  resolveWhatsAppDestination,
  whatsAppDraftUrl,
} from "@/lib/whatsapp-destination";

const CH = { code: "CH", source: "project" as const };
const JM = { code: "JM", source: "project" as const };

function e164(
  phone: string,
  country: { code: string; source: "project" | "manual" } | null,
) {
  const result = resolveWhatsAppDestination(phone, country);
  return result.status === "ready" ? result.e164 : result.issue;
}

describe("resolveWhatsAppDestination conversion matrix", () => {
  it.each([
    ["079 123 45 67", CH, "+41791234567"],
    ["0791234567", CH, "+41791234567"],
    ["876 379 7607", JM, "+18763797607"],
    ["8763797607", JM, "+18763797607"],
    ["(876) 379-7607", JM, "+18763797607"],
    ["876.379.7607", JM, "+18763797607"],
    ["1 876 379 7607", JM, "+18763797607"],
    ["1-876-379-7607", JM, "+18763797607"],
    ["+41 79 123 45 67", JM, "+41791234567"],
    ["+1 876 379 7607", CH, "+18763797607"],
    ["+44 20 7946 0958", JM, "+442079460958"],
    ["+44 20 7946 0958", CH, "+442079460958"],
    ["0041 79 123 45 67", JM, "+41791234567"],
    ["0041 79 123 45 67", CH, "+41791234567"],
    ["001 876 379 7607", CH, "+18763797607"],
    ["001 876 379 7607", JM, "+18763797607"],
    ["+41 (0)79 123 45 67", JM, "+41791234567"],
    ["+41 (0) 79 123 45 67", null, "+41791234567"],
    ["011 41 79 123 45 67", JM, "+41791234567"],
  ])("%s with %o -> %s", (phone, country, expected) => {
    expect(e164(phone, country)).toBe(expected);
  });

  it("never prepends the project code to a 1-prefixed Jamaican number", () => {
    expect(e164("1 876 379 7607", JM)).not.toBe("+118763797607");
  });

  it("keeps an explicit foreign country code and reports where the country came from", () => {
    const result = resolveWhatsAppDestination("+44 20 7946 0958", JM);
    expect(result).toMatchObject({
      status: "ready",
      countryCode: "GB",
      callingCode: "44",
      source: "explicit_prefix",
    });
  });

  it("marks local interpretation as inferred from the project", () => {
    const result = resolveWhatsAppDestination("876 379 7607", JM);
    expect(result).toMatchObject({
      status: "ready",
      countryCode: "JM",
      countryName: "Jamaica",
      source: "project",
    });
    const manual = resolveWhatsAppDestination("079 123 45 67", {
      code: "CH",
      source: "manual",
    });
    expect(manual).toMatchObject({ status: "ready", source: "manual" });
  });

  it("requires a country for a local number instead of guessing", () => {
    expect(e164("079 123 45 67", null)).toBe("needs_country");
    expect(e164("8763797607", null)).toBe("needs_country");
    expect(e164("8763797607", { code: "", source: "project" })).toBe(
      "needs_country",
    );
  });

  it("rejects unknown countries, extensions, multiple numbers, short and impossible input", () => {
    expect(e164("8763797607", { code: "XX", source: "project" })).toBe(
      "unsupported_country",
    );
    expect(e164("079 123 45 67 ext 12", CH)).toBe("extra_text");
    expect(e164("+41 79 123 45 67 x12", CH)).toBe("extra_text");
    expect(e164("079 123 45 67 / 078 765 43 21", CH)).toBe("extra_text");
    expect(e164("079 123 45 67, 078 765 43 21", CH)).toBe("extra_text");
    expect(e164("+41 79 123 45 67 +41 78 765 43 21", CH)).toBe("extra_text");
    expect(e164("079 123", CH)).toBe("invalid");
    expect(e164("+41 12", null)).toBe("invalid");
    expect(e164("+1 555 0100", JM)).toBe("invalid");
    expect(e164("", CH)).toBe("missing");
    expect(e164("   ", JM)).toBe("missing");
  });

  it("does not strip arbitrary leading zeros", () => {
    expect(e164("0000791234567", CH)).toBe("invalid");
    expect(e164("000 876 379 7607", JM)).toBe("invalid");
  });

  it("accepts a prefixless country-code number only when the parser resolves it", () => {
    expect(e164("41791234567", CH)).toBe("+41791234567");
    expect(e164("18763797607", JM)).toBe("+18763797607");
  });
});

describe("WhatsApp draft links", () => {
  it("builds wa.me links with encoded text and no trailing country guess", () => {
    expect(whatsAppDraftUrl("18763797607", "Hi\nthere")).toBe(
      "https://wa.me/18763797607?text=Hi%0Athere",
    );
    expect(whatsAppDraftUrl("41791234567", "  ")).toBe(
      "https://wa.me/41791234567",
    );
  });

  it("whatsappHref delegates to the central resolver", () => {
    expect(whatsappHref("+33 6 12 34 56 78")).toBe("https://wa.me/33612345678");
    expect(whatsappHref("0033 6 12 34 56 78")).toBe(
      "https://wa.me/33612345678",
    );
    expect(whatsappHref("06 12 34 56 78")).toBeNull();
    expect(whatsappHref("8763797607", null, "JM")).toBe(
      "https://wa.me/18763797607",
    );
    expect(whatsappHref("079 123 45 67", "Hi", "CH")).toBe(
      "https://wa.me/41791234567?text=Hi",
    );
  });
});
