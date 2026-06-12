import "server-only";

import {
  DICTIONARY_TYPES,
  TAG_ENTITY_TYPES,
  isDictionaryType,
  isTagEntityType,
  type DictionaryType,
  type TagEntityType,
} from "@/lib/dictionary-constants";

export {
  DICTIONARY_TYPES,
  TAG_ENTITY_TYPES,
  isDictionaryType,
  isTagEntityType,
  type DictionaryType,
  type TagEntityType,
};

export const OPPORTUNITY_STATUS_BEHAVIORS = [
  "open",
  "terminal_won",
  "terminal_lost",
] as const;

export type OpportunityStatusBehavior =
  (typeof OPPORTUNITY_STATUS_BEHAVIORS)[number];

export const ACTIVITY_STATUS_BEHAVIORS = [
  "pending",
  "completed",
  "cancelled",
] as const;

export type ActivityStatusBehavior = (typeof ACTIVITY_STATUS_BEHAVIORS)[number];

export type DefaultDictionaryItemSeed = {
  key: string;
  label: string;
  color: string;
  order: number;
  isDefault?: boolean;
  behavior?: string;
  defaultProbability?: number;
};

export type DefaultDictionarySeed = {
  type: DictionaryType;
  name: string;
  items: DefaultDictionaryItemSeed[];
};

export const DEFAULT_DICTIONARY_SEEDS: DefaultDictionarySeed[] = [
  {
    type: "lead_status",
    name: "Lead status",
    items: [
      { key: "new", label: "New", color: "#3B82F6", order: 0, isDefault: true },
      { key: "contacted", label: "Contacted", color: "#F59E0B", order: 1 },
      { key: "qualified", label: "Qualified", color: "#10B981", order: 2 },
      { key: "lost", label: "Lost", color: "#6B7280", order: 3 },
    ],
  },
  {
    type: "property_status",
    name: "Property status",
    items: [
      { key: "available", label: "Available", color: "#10B981", order: 0, isDefault: true },
      { key: "reserved", label: "Reserved", color: "#F59E0B", order: 1 },
      { key: "sold", label: "Sold", color: "#EF4444", order: 2 },
      { key: "inactive", label: "Inactive", color: "#6B7280", order: 3 },
    ],
  },
  {
    type: "opportunity_status",
    name: "Opportunity status",
    items: [
      { key: "new", label: "New", color: "#3B82F6", order: 0, isDefault: true, behavior: "open", defaultProbability: 10 },
      { key: "qualified", label: "Qualified", color: "#6366F1", order: 1, behavior: "open", defaultProbability: 25 },
      { key: "visit", label: "Visit", color: "#8B5CF6", order: 2, behavior: "open", defaultProbability: 40 },
      { key: "offer", label: "Offer", color: "#F59E0B", order: 3, behavior: "open", defaultProbability: 60 },
      { key: "negotiation", label: "Negotiation", color: "#F97316", order: 4, behavior: "open", defaultProbability: 80 },
      { key: "won", label: "Won", color: "#10B981", order: 5, behavior: "terminal_won", defaultProbability: 100 },
      { key: "lost", label: "Lost", color: "#EF4444", order: 6, behavior: "terminal_lost", defaultProbability: 0 },
    ],
  },
  {
    type: "activity_status",
    name: "Activity status",
    items: [
      { key: "pending", label: "Pending", color: "#F59E0B", order: 0, isDefault: true, behavior: "pending" },
      { key: "completed", label: "Completed", color: "#10B981", order: 1, behavior: "completed" },
      { key: "cancelled", label: "Cancelled", color: "#6B7280", order: 2, behavior: "cancelled" },
    ],
  },
  {
    type: "activity_type",
    name: "Activity type",
    items: [
      { key: "call", label: "Call", color: "#3B82F6", order: 0 },
      { key: "email", label: "Email", color: "#6366F1", order: 1 },
      { key: "meeting", label: "Meeting", color: "#8B5CF6", order: 2 },
      { key: "visit", label: "Visit", color: "#10B981", order: 3 },
      { key: "task", label: "Task", color: "#F59E0B", order: 4 },
      { key: "note", label: "Note", color: "#6B7280", order: 5, isDefault: true },
    ],
  },
  {
    type: "lead_source",
    name: "Lead source",
    items: [
      { key: "website", label: "Website", color: "#3B82F6", order: 0, isDefault: true },
      { key: "google_ads", label: "Google Ads", color: "#4285F4", order: 1 },
      { key: "meta_ads", label: "Meta Ads", color: "#1877F2", order: 2 },
      { key: "portal", label: "Portal", color: "#8B5CF6", order: 3 },
      { key: "referral", label: "Referral", color: "#10B981", order: 4 },
      { key: "broker", label: "Broker", color: "#F59E0B", order: 5 },
      { key: "manual", label: "Manual", color: "#6B7280", order: 6 },
    ],
  },
  {
    type: "property_type",
    name: "Property type",
    items: [
      { key: "apartment", label: "Apartment", color: "#3B82F6", order: 0, isDefault: true },
      { key: "villa", label: "Villa", color: "#10B981", order: 1 },
      { key: "townhouse", label: "Townhouse", color: "#6366F1", order: 2 },
      { key: "penthouse", label: "Penthouse", color: "#8B5CF6", order: 3 },
      { key: "land", label: "Land", color: "#84CC16", order: 4 },
      { key: "commercial", label: "Commercial", color: "#F59E0B", order: 5 },
      { key: "office", label: "Office", color: "#06B6D4", order: 6 },
      { key: "other", label: "Other", color: "#6B7280", order: 7 },
    ],
  },
  {
    type: "lost_reason",
    name: "Lost reason",
    items: [
      { key: "budget_mismatch", label: "Budget mismatch", color: "#F59E0B", order: 0 },
      { key: "bought_elsewhere", label: "Bought elsewhere", color: "#EF4444", order: 1 },
      { key: "no_response", label: "No response", color: "#6B7280", order: 2 },
      { key: "not_interested", label: "Not interested", color: "#9CA3AF", order: 3 },
      { key: "property_unavailable", label: "Property unavailable", color: "#8B5CF6", order: 4 },
      { key: "duplicate_lead", label: "Duplicate lead", color: "#6366F1", order: 5 },
      { key: "other", label: "Other", color: "#374151", order: 6, isDefault: true },
    ],
  },
];

export function getAllowedBehaviorsForType(
  type: DictionaryType,
): readonly string[] | null {
  if (type === "opportunity_status") {
    return OPPORTUNITY_STATUS_BEHAVIORS;
  }
  if (type === "activity_status") {
    return ACTIVITY_STATUS_BEHAVIORS;
  }
  return null;
}

export function validateBehaviorForType(
  type: DictionaryType,
  behavior: string | undefined,
): boolean {
  const allowed = getAllowedBehaviorsForType(type);
  if (!allowed) {
    return behavior === undefined;
  }
  if (behavior === undefined) {
    return false;
  }
  return (allowed as readonly string[]).includes(behavior);
}
