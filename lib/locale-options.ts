export const CURRENCY_CODES = [
  "CHF",
  "EUR",
  "USD",
  "GBP",
  "AED",
  "CAD",
  "AUD",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
  "CZK",
  "HUF",
  "JPY",
  "SGD",
  "HKD",
] as const;

export type CurrencyCode = (typeof CURRENCY_CODES)[number];

export const CURRENCY_LABELS: Record<CurrencyCode, string> = {
  CHF: "CHF — Swiss franc",
  EUR: "EUR — Euro",
  USD: "USD — US dollar",
  GBP: "GBP — British pound",
  AED: "AED — UAE dirham",
  CAD: "CAD — Canadian dollar",
  AUD: "AUD — Australian dollar",
  SEK: "SEK — Swedish krona",
  NOK: "NOK — Norwegian krone",
  DKK: "DKK — Danish krone",
  PLN: "PLN — Polish złoty",
  CZK: "CZK — Czech koruna",
  HUF: "HUF — Hungarian forint",
  JPY: "JPY — Japanese yen",
  SGD: "SGD — Singapore dollar",
  HKD: "HKD — Hong Kong dollar",
};

export const TIMEZONE_IDS = [
  "UTC",
  "Europe/Zurich",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Vienna",
  "Europe/Rome",
  "Europe/Madrid",
  "Europe/Amsterdam",
  "Europe/Brussels",
  "Europe/Lisbon",
  "Europe/Stockholm",
  "Europe/Warsaw",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Tokyo",
  "Australia/Sydney",
] as const;

export type TimezoneId = (typeof TIMEZONE_IDS)[number];

export function formatTimezoneLabel(timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en", {
      timeZone,
      timeZoneName: "shortOffset",
    }).formatToParts(new Date());
    const offset = parts.find((part) => part.type === "timeZoneName")?.value ?? "";
    const city = timeZone.includes("/") ? timeZone.split("/").pop()?.replace(/_/g, " ") : timeZone;
    return offset ? `${city} (${offset})` : city ?? timeZone;
  } catch {
    return timeZone;
  }
}

export function buildCurrencyOptions(currentValue?: string) {
  const normalized = currentValue?.trim().toUpperCase();
  const options = CURRENCY_CODES.map((code) => ({
    value: code,
    label: CURRENCY_LABELS[code],
  }));

  if (normalized && !CURRENCY_CODES.includes(normalized as CurrencyCode)) {
    return [{ value: normalized, label: `${normalized} (current)` }, ...options];
  }

  return options;
}

export function buildTimezoneOptions(currentValue?: string) {
  const normalized = currentValue?.trim();
  const options = TIMEZONE_IDS.map((id) => ({
    value: id,
    label: formatTimezoneLabel(id),
  }));

  if (normalized && !TIMEZONE_IDS.includes(normalized as TimezoneId)) {
    return [{ value: normalized, label: `${normalized} (current)` }, ...options];
  }

  return options;
}
