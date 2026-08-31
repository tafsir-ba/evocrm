/**
 * Ongoing HubSpot → EvoHome project attribution.
 * wd_project is authoritative; otherwise validated Product interested in /
 * established HubSpotProjectMapping. Never routes to EvoHome General.
 * No I/O.
 */

import { isCmpCrmProjectIdentity } from "@/lib/inbound-acquisition";
import {
  planHubSpotMultiProjectMemberships,
  type PlannedHubSpotMembership,
} from "@/lib/hubspot-multi-project-membership";
import { splitHubSpotMultiValue } from "@/lib/hubspot-gv-pilot";
import {
  WD_MIGRATION_GENERAL_PROJECT_ID,
  WD_MIGRATION_GENERAL_REFERENCE,
  WD_MIGRATION_GV_PROJECT_ID,
  WD_MIGRATION_GV_REFERENCE,
} from "@/lib/hubspot-wd-project-migration";

export const HUBSPOT_ONGOING_ATTR_REASONS = [
  "mapped",
  "multi_project",
  "project_conflict",
  "unmapped_project",
  "no_project_signal",
  "destination_forbidden",
  "manual_membership_preserved",
] as const;
export type HubSpotOngoingAttrReason = (typeof HUBSPOT_ONGOING_ATTR_REASONS)[number];

export const HUBSPOT_PRODUCT_LINE_TOKENS = ["WD", "CMP"] as const;

export type HubSpotOngoingMapping = {
  hubspotProjectId: string;
  status: string;
  evoProjectId: string | null;
  evoProjectName?: string | null;
  evoProjectReference?: string | null;
};

export type HubSpotOngoingAttribution = {
  ok: boolean;
  reason: HubSpotOngoingAttrReason;
  source: "wd_project" | "product_mapping" | "established_mapping" | "none";
  primaryProjectId: string | null;
  projectIds: string[];
  memberships: PlannedHubSpotMembership[];
  conflicts: string[];
  parked: boolean;
  triggerAutomation: false;
};

function normalizeSlug(value: string): string {
  return value.trim().toLowerCase();
}

function isProductLineToken(token: string): boolean {
  return (HUBSPOT_PRODUCT_LINE_TOKENS as readonly string[]).includes(token.trim().toUpperCase());
}

export function isForbiddenEvoHomeDestination(input: {
  evoProjectId?: string | null;
  evoProjectReference?: string | null;
  evoProjectName?: string | null;
  extraForbiddenIds?: Iterable<string>;
}): boolean {
  const extra = new Set(input.extraForbiddenIds ?? []);
  if (input.evoProjectId && extra.has(input.evoProjectId)) {
    return true;
  }
  if (
    input.evoProjectId === WD_MIGRATION_GENERAL_PROJECT_ID ||
    input.evoProjectId === WD_MIGRATION_GV_PROJECT_ID
  ) {
    return true;
  }
  const reference = input.evoProjectReference?.trim().toUpperCase() ?? "";
  if (reference === WD_MIGRATION_GENERAL_REFERENCE || reference === WD_MIGRATION_GV_REFERENCE) {
    return true;
  }
  const name = input.evoProjectName?.trim() ?? "";
  if (/^evohome\s+general/i.test(name) || /^evo-?home\s+general/i.test(name)) {
    return true;
  }
  return false;
}

function mappingKey(mapping: HubSpotOngoingMapping): string {
  return normalizeSlug(mapping.hubspotProjectId);
}

export function indexHubSpotOngoingMappings(
  mappings: HubSpotOngoingMapping[],
): Map<string, HubSpotOngoingMapping> {
  const index = new Map<string, HubSpotOngoingMapping>();
  for (const mapping of mappings) {
    index.set(mappingKey(mapping), mapping);
  }
  return index;
}

function resolveMappedProject(
  token: string,
  index: Map<string, HubSpotOngoingMapping>,
):
  | { ok: true; mapping: HubSpotOngoingMapping }
  | { ok: false; reason: HubSpotOngoingAttrReason } {
  const mapping = index.get(normalizeSlug(token));
  if (!mapping) {
    return { ok: false, reason: "unmapped_project" };
  }
  if (mapping.status !== "mapped" || !mapping.evoProjectId) {
    return { ok: false, reason: "unmapped_project" };
  }
  if (
    isForbiddenEvoHomeDestination({
      evoProjectId: mapping.evoProjectId,
      evoProjectName: mapping.evoProjectName,
      evoProjectReference: mapping.evoProjectReference,
    })
  ) {
    return { ok: false, reason: "destination_forbidden" };
  }
  return { ok: true, mapping };
}

function park(
  reason: HubSpotOngoingAttrReason,
  conflicts: string[] = [reason],
): HubSpotOngoingAttribution {
  return {
    ok: false,
    reason,
    source: "none",
    primaryProjectId: null,
    projectIds: [],
    memberships: [],
    conflicts,
    parked: true,
    triggerAutomation: false,
  };
}

function mappedResult(input: {
  source: HubSpotOngoingAttribution["source"];
  mappings: HubSpotOngoingMapping[];
  hubspotContactId?: string;
  fallbackNow?: Date;
  multiProjectEnabled: boolean;
}): HubSpotOngoingAttribution {
  const unique = new Map<string, HubSpotOngoingMapping>();
  for (const mapping of input.mappings) {
    if (mapping.evoProjectId) {
      unique.set(mapping.evoProjectId, mapping);
    }
  }
  const ordered = [...unique.values()];
  if (ordered.length === 0) {
    return park("no_project_signal");
  }

  if (ordered.length > 1 && !input.multiProjectEnabled) {
    return park("project_conflict", ["multi_project_not_released"]);
  }

  const planned = planHubSpotMultiProjectMemberships({
    associations: ordered.map((mapping, index) => ({
      projectId: mapping.evoProjectId as string,
      sourceOrder: index,
      hubspotProjectId: mapping.hubspotProjectId,
    })),
    hubspotContactId: input.hubspotContactId,
    fallbackNow: input.fallbackNow,
  });

  if (!planned.ok) {
    return park("project_conflict", planned.conflicts);
  }

  const projectIds = planned.memberships.map((item) => item.projectId);
  const primary = planned.memberships.find((item) => item.isPrimary)?.projectId ?? projectIds[0] ?? null;

  return {
    ok: true,
    reason: ordered.length > 1 ? "multi_project" : "mapped",
    source: input.source,
    primaryProjectId: primary,
    projectIds,
    memberships: planned.memberships,
    conflicts: [],
    parked: false,
    triggerAutomation: false,
  };
}

function cmpMappedDestinations(index: Map<string, HubSpotOngoingMapping>): HubSpotOngoingMapping[] {
  const matches: HubSpotOngoingMapping[] = [];
  for (const mapping of index.values()) {
    if (mapping.status !== "mapped" || !mapping.evoProjectId) {
      continue;
    }
    if (
      isCmpCrmProjectIdentity(mapping.evoProjectName, mapping.evoProjectReference) ||
      isCmpCrmProjectIdentity(mapping.hubspotProjectId, mapping.hubspotProjectId)
    ) {
      matches.push(mapping);
    }
  }
  return matches;
}

export function planHubSpotOngoingAttribution(input: {
  wdProjectValue?: string | null;
  productInterestedIn?: string | null;
  associationProjectIds?: string[] | null;
  mappings: HubSpotOngoingMapping[];
  hubspotContactId?: string;
  fallbackNow?: Date;
  multiProjectEnabled?: boolean;
}): HubSpotOngoingAttribution {
  const multiProjectEnabled = input.multiProjectEnabled !== false;
  const index = indexHubSpotOngoingMappings(input.mappings);
  const wdTokens = splitHubSpotMultiValue(input.wdProjectValue);
  const productTokens = splitHubSpotMultiValue(input.productInterestedIn);
  const associationIds = (input.associationProjectIds ?? []).map((id) => id.trim()).filter(Boolean);

  if (wdTokens.length > 0) {
    const resolved: HubSpotOngoingMapping[] = [];
    for (const token of wdTokens) {
      const result = resolveMappedProject(token, index);
      if (!result.ok) {
        return park(result.reason, [`wd_project:${token}:${result.reason}`]);
      }
      resolved.push(result.mapping);
    }
    return mappedResult({
      source: "wd_project",
      mappings: resolved,
      hubspotContactId: input.hubspotContactId,
      fallbackNow: input.fallbackNow,
      multiProjectEnabled,
    });
  }

  if (associationIds.length > 0) {
    const resolved: HubSpotOngoingMapping[] = [];
    for (const token of associationIds) {
      const result = resolveMappedProject(token, index);
      if (!result.ok) {
        return park(result.reason, [`association:${token}:${result.reason}`]);
      }
      resolved.push(result.mapping);
    }
    return mappedResult({
      source: "established_mapping",
      mappings: resolved,
      hubspotContactId: input.hubspotContactId,
      fallbackNow: input.fallbackNow,
      multiProjectEnabled,
    });
  }

  const productMapped: HubSpotOngoingMapping[] = [];
  let sawNonLineToken = false;
  for (const token of productTokens) {
    if (isProductLineToken(token) && token.trim().toUpperCase() === "WD") {
      continue;
    }
    if (token.trim().toUpperCase() === "CMP") {
      const cmpDestinations = cmpMappedDestinations(index);
      if (cmpDestinations.length === 0) {
        return park("unmapped_project", ["product:CMP:unmapped_project"]);
      }
      if (cmpDestinations.length > 1 && !multiProjectEnabled) {
        return park("project_conflict", ["product:CMP:multiple_cmp_destinations"]);
      }
      if (cmpDestinations.length > 1) {
        const uniqueIds = new Set(cmpDestinations.map((item) => item.evoProjectId));
        if (uniqueIds.size > 1) {
          return park("project_conflict", ["product:CMP:multiple_cmp_destinations"]);
        }
      }
      productMapped.push(cmpDestinations[0]!);
      continue;
    }
    sawNonLineToken = true;
    const result = resolveMappedProject(token, index);
    if (!result.ok) {
      return park(result.reason, [`product:${token}:${result.reason}`]);
    }
    productMapped.push(result.mapping);
  }

  if (productMapped.length > 0) {
    return mappedResult({
      source: sawNonLineToken ? "established_mapping" : "product_mapping",
      mappings: productMapped,
      hubspotContactId: input.hubspotContactId,
      fallbackNow: input.fallbackNow,
      multiProjectEnabled,
    });
  }

  return park("no_project_signal");
}

export function shouldPreserveManualMemberships(
  existingSources: Array<string | null | undefined>,
): boolean {
  return existingSources.some((source) => source === "manual");
}
