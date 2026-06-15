export const PROPERTY_TYPE_INTERESTS = [
  "apartment",
  "penthouse",
  "villa",
  "house",
  "commercial",
  "office",
  "retail",
  "industrial",
  "land",
  "investment_property",
  "other",
] as const;

export type PropertyTypeInterest = (typeof PROPERTY_TYPE_INTERESTS)[number];

export const PROPERTY_TYPE_INTEREST_LABELS: Record<PropertyTypeInterest, string> = {
  apartment: "Apartment",
  penthouse: "Penthouse",
  villa: "Villa",
  house: "House",
  commercial: "Commercial",
  office: "Office",
  retail: "Retail",
  industrial: "Industrial",
  land: "Land",
  investment_property: "Investment Property",
  other: "Other",
};

export const TRANSACTION_INTENTS = ["buy", "rent", "invest", "sell", "unsure"] as const;

export type TransactionIntent = (typeof TRANSACTION_INTENTS)[number];

export const TRANSACTION_INTENT_LABELS: Record<TransactionIntent, string> = {
  buy: "Buy",
  rent: "Rent",
  invest: "Invest",
  sell: "Sell",
  unsure: "Unsure",
};

export const USAGE_PURPOSES = [
  "primary_residence",
  "secondary_residence",
  "holiday_home",
  "retirement",
  "investment",
  "commercial_use",
] as const;

export type UsagePurpose = (typeof USAGE_PURPOSES)[number];

export const USAGE_PURPOSE_LABELS: Record<UsagePurpose, string> = {
  primary_residence: "Primary Residence",
  secondary_residence: "Secondary Residence",
  holiday_home: "Holiday Home",
  retirement: "Retirement",
  investment: "Investment",
  commercial_use: "Commercial Use",
};

export function labelPropertyTypeInterest(value: PropertyTypeInterest): string {
  return PROPERTY_TYPE_INTEREST_LABELS[value];
}

export function labelTransactionIntent(value: TransactionIntent): string {
  return TRANSACTION_INTENT_LABELS[value];
}

export function labelUsagePurpose(value: UsagePurpose): string {
  return USAGE_PURPOSE_LABELS[value];
}
