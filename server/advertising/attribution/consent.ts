import "server-only";

import {
  CONSENT_CAPTURE_CHANNELS,
  CONSENT_PURPOSES,
  type ConsentCaptureChannel,
  type ConsentPurpose,
} from "@/lib/advertising-constants";

/**
 * Consent fields Phase 2 touchpoints must capture (pixel vs form vs server-side).
 * Scaffolding only in Phase 0 — no capture pipeline yet.
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
