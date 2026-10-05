import "server-only";

import {
  CONSENT_CAPTURE_CHANNELS,
  CONSENT_PURPOSES,
  type ConsentCaptureChannel,
  type ConsentPurpose,
} from "@/lib/advertising-constants";
import {
  isAdvertisingMeasurementAllowed,
  type CookieConsentRecord,
} from "@/lib/cookie-consent";

/**
 * Consent fields Phase 2 touchpoints must capture (pixel vs form vs server-side).
 * Advertising grant comes from cookie-consent OPTIONAL advertising category only —
 * never from email subscribe or mandatory terms alone.
 */
export { CONSENT_CAPTURE_CHANNELS, CONSENT_PURPOSES };
export type { ConsentCaptureChannel, ConsentPurpose };

export type ConsentState = {
  /** Whether the data subject granted the required advertising / CAPI consent. */
  granted: boolean;
  /** Channel that recorded consent. */
  channel: ConsentCaptureChannel | null;
  /** Purposes covered at capture time. */
  purposes: ConsentPurpose[];
  /** ISO policy / banner version when known. */
  policyVersion: string | null;
  /** When consent was recorded (server time). */
  capturedAt: Date | null;
  /** Market / jurisdiction hint (e.g. CH, EU). */
  market: string | null;
};

export function emptyConsentState(): ConsentState {
  return {
    granted: false,
    channel: null,
    purposes: [],
    policyVersion: null,
    capturedAt: null,
    market: null,
  };
}

/**
 * Map a visitor cookie-consent record into first-class ConsentState.
 * Declined or withdrawn advertising → granted false (no Meta measurement processing).
 */
export function consentStateFromCookieConsent(
  cookie: CookieConsentRecord | null | undefined,
  options: { market?: string | null } = {},
): ConsentState {
  if (!cookie) {
    return emptyConsentState();
  }

  const decidedAt = cookie.decidedAt ? new Date(cookie.decidedAt) : new Date();
  const allowed = isAdvertisingMeasurementAllowed(cookie);

  if (!allowed) {
    return {
      granted: false,
      channel: "pixel",
      purposes: [],
      policyVersion: cookie.version,
      capturedAt: decidedAt,
      market: options.market ?? null,
    };
  }

  return {
    granted: true,
    channel: "pixel",
    purposes: ["advertising", "conversion_export", "analytics"],
    policyVersion: cookie.version,
    capturedAt: decidedAt,
    market: options.market ?? null,
  };
}

export function canExportConversion(consent: ConsentState): boolean {
  return (
    consent.granted === true &&
    consent.purposes.includes("conversion_export")
  );
}

export function canExportCustomerMatch(consent: ConsentState): boolean {
  return (
    consent.granted === true &&
    consent.purposes.includes("customer_match")
  );
}
