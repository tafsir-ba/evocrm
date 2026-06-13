/** Client-safe helpers for dictionary item keys and behavior-aware forms. */

import type { DictionaryType } from "@/lib/dictionary-constants";

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

export function dictionaryTypeRequiresBehavior(type: DictionaryType): boolean {
  return type === "opportunity_status" || type === "activity_status";
}

export function slugifyDictionaryKey(label: string): string {
  const key = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return key.slice(0, 64);
}

export function isTerminalWonBehavior(behavior: string | undefined): boolean {
  return behavior === "terminal_won";
}

export function isTerminalLostBehavior(behavior: string | undefined): boolean {
  return behavior === "terminal_lost";
}

export function isTerminalOpportunityBehavior(behavior: string | undefined): boolean {
  return isTerminalWonBehavior(behavior) || isTerminalLostBehavior(behavior);
}
