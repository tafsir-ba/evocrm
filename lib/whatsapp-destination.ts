import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js/max";

import {
  countryDisplayName,
  normalizeCountryCode,
} from "@/lib/project-location";

export type WhatsAppCountrySource = "explicit_prefix" | "project" | "manual";

export type WhatsAppDestinationIssue =
  | "missing"
  | "extra_text"
  | "needs_country"
  | "unsupported_country"
  | "invalid";

export type WhatsAppDestination =
  | {
      status: "ready";
      /** E.164, e.g. +18763797607. */
      e164: string;
      /** Digits used by wa.me (E.164 without "+"). */
      waNumber: string;
      /** Country the number belongs to, which may differ from the project country. */
      countryCode: string | null;
      countryName: string | null;
      callingCode: string;
      display: string;
      source: WhatsAppCountrySource;
    }
  | {
      status: "unresolved";
      issue: WhatsAppDestinationIssue;
      message: string;
    };

const SUPPORTED_COUNTRIES = new Set<string>(getCountries());

/** Characters a phone number may be written with. Anything else (ext, "/", ",", "or") needs a human. */
const PHONE_CHARACTERS = /^[+\d\s().\-\u00a0\u2010-\u2015]+$/;
const MAX_INPUT_DIGITS = 17;

export function isSupportedPhoneCountry(
  code: string | null | undefined,
): boolean {
  const normalized = normalizeCountryCode(code);
  return Boolean(normalized && SUPPORTED_COUNTRIES.has(normalized));
}

export function phoneCountryOptions(): Array<{ code: string; name: string }> {
  return [...SUPPORTED_COUNTRIES]
    .map((code) => ({ code, name: countryDisplayName(code) ?? code }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function unresolved(
  issue: WhatsAppDestinationIssue,
  message: string,
): WhatsAppDestination {
  return { status: "unresolved", issue, message };
}

function hasExplicitInternationalPrefix(trimmed: string): boolean {
  return trimmed.startsWith("+") || /^00[1-9]/.test(trimmed.replace(/\D/g, ""));
}

/**
 * Single source of truth for turning a saved lead phone into a WhatsApp destination.
 *
 * An explicit "+" or "00" prefix always wins over the project country. A number without one is
 * only interpreted with a known country; otherwise it stays unresolved so nobody opens the wrong
 * chat. The saved phone value is never modified.
 */
export function resolveWhatsAppDestination(
  phone: string | null | undefined,
  country: {
    code: string | null | undefined;
    source: "project" | "manual";
  } | null,
): WhatsAppDestination {
  const trimmed = (phone ?? "").trim();
  if (!trimmed) {
    return unresolved("missing", "This lead has no phone number.");
  }
  if (!PHONE_CHARACTERS.test(trimmed)) {
    return unresolved(
      "extra_text",
      "The phone contains an extension, a second number or other text. Enter a single number.",
    );
  }
  const digits = trimmed.replace(/\D/g, "");
  if (
    digits.length > MAX_INPUT_DIGITS ||
    (trimmed.match(/\+/g)?.length ?? 0) > 1
  ) {
    return unresolved(
      "extra_text",
      "The phone looks like more than one number. Enter a single number.",
    );
  }

  const explicit = hasExplicitInternationalPrefix(trimmed);
  let parsed;
  let source: WhatsAppCountrySource;
  if (explicit) {
    const international = trimmed.startsWith("+")
      ? trimmed
      : `+${trimmed.replace(/^[^\d]*0\s*0/, "")}`;
    parsed = parsePhoneNumberFromString(international);
    source = "explicit_prefix";
  } else {
    const code = normalizeCountryCode(country?.code ?? null);
    if (!code) {
      return unresolved(
        "needs_country",
        "This number has no international prefix. Choose the country it belongs to.",
      );
    }
    if (!SUPPORTED_COUNTRIES.has(code)) {
      return unresolved(
        "unsupported_country",
        `Country ${code} is not supported for phone dialing. Choose another country or enter the number with +.`,
      );
    }
    parsed = parsePhoneNumberFromString(trimmed, code as CountryCode);
    // A dialed IDD such as Jamaica's 011 already names the destination country.
    source =
      parsed &&
      parsed.countryCallingCode !== getCountryCallingCode(code as CountryCode)
        ? "explicit_prefix"
        : (country?.source ?? "project");
  }

  if (!parsed || parsed.ext || !parsed.isValid()) {
    return unresolved(
      "invalid",
      explicit
        ? "This international number is incomplete or not a valid phone number."
        : `This number is not valid for ${countryDisplayName(country?.code) ?? "the selected country"}. Check the digits or choose another country.`,
    );
  }

  const countryCode = parsed.country ?? null;
  return {
    status: "ready",
    e164: parsed.number,
    waNumber: parsed.number.replace(/^\+/, ""),
    countryCode,
    countryName: countryDisplayName(countryCode),
    callingCode: parsed.countryCallingCode,
    display: parsed.formatInternational(),
    source,
  };
}

export function whatsAppDraftUrl(
  waNumber: string,
  message?: string | null,
): string {
  const href = `https://wa.me/${waNumber}`;
  const text = message?.trim();
  return text ? `${href}?text=${encodeURIComponent(text)}` : href;
}
