export const DICTIONARY_TYPES = [
  "lead_status",
  "property_status",
  "opportunity_status",
  "activity_status",
  "activity_type",
  "lead_source",
  "property_type",
  "lost_reason",
] as const;

export type DictionaryType = (typeof DICTIONARY_TYPES)[number];

export const DICTIONARY_TYPE_LABELS: Record<DictionaryType, string> = {
  lead_status: "Lead status",
  property_status: "Property status",
  opportunity_status: "Opportunity status",
  activity_status: "Activity status",
  activity_type: "Activity type",
  lead_source: "Lead source",
  property_type: "Property type",
  lost_reason: "Lost reason",
};

export const TAG_ENTITY_TYPES = ["lead", "property", "opportunity"] as const;

export type TagEntityType = (typeof TAG_ENTITY_TYPES)[number];

export function isDictionaryType(value: string): value is DictionaryType {
  return (DICTIONARY_TYPES as readonly string[]).includes(value);
}

export function isTagEntityType(value: string): value is TagEntityType {
  return (TAG_ENTITY_TYPES as readonly string[]).includes(value);
}
