/**
 * Cookie-consent design for Satigny / Growth Copilot Phase 2.
 * OPTIONAL advertising measurement only — never equate with mandatory terms or email consent.
 * Client-safe (banner + privacy page).
 */

export const COOKIE_CONSENT_VERSION = "satigny-cookie-v1" as const;

export const COOKIE_CONSENT_STORAGE_KEY = "evo_cookie_consent_v1" as const;

export const COOKIE_CONSENT_CATEGORIES = ["necessary", "advertising"] as const;
export type CookieConsentCategory = (typeof COOKIE_CONSENT_CATEGORIES)[number];

export type CookieConsentCategoryChoices = {
  /** Always on — required for the site to work. Not advertising consent. */
  necessary: true;
  /** OPTIONAL — Meta measurement / conversion tracking. */
  advertising: boolean;
};

export type CookieConsentRecord = {
  version: typeof COOKIE_CONSENT_VERSION | string;
  decidedAt: string; // ISO timestamp
  categories: CookieConsentCategoryChoices;
  /** True after visitor withdraws optional advertising (or declines). */
  withdrawn: boolean;
};

export const COOKIE_CONSENT_NOTICE =
  "We use optional cookies for Meta measurement and conversion tracking so we can see which ads bring real interest. Necessary cookies keep the site working and are always on.";

export const COOKIE_CONSENT_PRIVACY_PATH = "/privacy-cookies" as const;

export function createAcceptedAdvertisingConsent(
  decidedAt: Date = new Date(),
): CookieConsentRecord {
  return {
    version: COOKIE_CONSENT_VERSION,
    decidedAt: decidedAt.toISOString(),
    categories: { necessary: true, advertising: true },
    withdrawn: false,
  };
}

export function createDeclinedAdvertisingConsent(
  decidedAt: Date = new Date(),
): CookieConsentRecord {
  return {
    version: COOKIE_CONSENT_VERSION,
    decidedAt: decidedAt.toISOString(),
    categories: { necessary: true, advertising: false },
    withdrawn: true,
  };
}

export function createManagedCookieConsent(input: {
  advertising: boolean;
  decidedAt?: Date;
}): CookieConsentRecord {
  const advertising = Boolean(input.advertising);
  return {
    version: COOKIE_CONSENT_VERSION,
    decidedAt: (input.decidedAt ?? new Date()).toISOString(),
    categories: { necessary: true, advertising },
    withdrawn: !advertising,
  };
}

export function isAdvertisingMeasurementAllowed(
  record: CookieConsentRecord | null | undefined,
): boolean {
  if (!record) return false;
  if (record.withdrawn) return false;
  return record.categories.advertising === true;
}

export function readCookieConsentFromStorage(
  storage: Pick<Storage, "getItem"> | null | undefined,
): CookieConsentRecord | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(COOKIE_CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CookieConsentRecord;
    if (!parsed?.version || !parsed.decidedAt || !parsed.categories) return null;
    return {
      version: String(parsed.version),
      decidedAt: String(parsed.decidedAt),
      categories: {
        necessary: true,
        advertising: Boolean(parsed.categories.advertising),
      },
      withdrawn: Boolean(parsed.withdrawn) || !parsed.categories.advertising,
    };
  } catch {
    return null;
  }
}

export function writeCookieConsentToStorage(
  storage: Pick<Storage, "setItem"> | null | undefined,
  record: CookieConsentRecord,
): void {
  if (!storage) return;
  storage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(record));
}
