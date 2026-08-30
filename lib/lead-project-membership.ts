/**
 * Native multi-project contact membership (contacts are Leads).
 * Analogous to HubSpot associations: a contact may belong to many projects,
 * but exactly one membership is primary.
 *
 * No I/O. Campaign / drip enrollment is never derived from these helpers.
 */

export const LEAD_PROJECT_MEMBERSHIP_SOURCES = [
  "lead_create",
  "backfill",
  "manual",
  "hubspot_association",
  "import",
] as const;

export type LeadProjectMembershipSource =
  (typeof LEAD_PROJECT_MEMBERSHIP_SOURCES)[number];

export const LEAD_PROJECT_MEMBERSHIP_PROVENANCE_METHODS = [
  "lead_create",
  "backfill",
  "manual",
  "hubspot_association",
  "import",
] as const;

export type LeadProjectMembershipProvenanceMethod =
  (typeof LEAD_PROJECT_MEMBERSHIP_PROVENANCE_METHODS)[number];

export type LeadProjectMembershipProvenance = {
  method: LeadProjectMembershipProvenanceMethod;
  source: string;
  appliedAt: string;
  notes: string;
  hubspotContactId?: string;
  hubspotAssociationId?: string;
  sourceMembershipDate?: string;
  sourceOrder?: number;
};

export type MembershipHistoryCandidate = {
  projectId: string;
  joinedAt?: Date | string | null;
  sourceOrder?: number | null;
  isPrimary?: boolean;
};

export type NormalizedMembershipPlan = {
  projectId: string;
  isPrimary: boolean;
  joinedAt: Date;
  sourceOrder: number;
};

export type MembershipConflict =
  | "duplicate_project"
  | "multiple_primaries"
  | "missing_primary"
  | "empty_memberships"
  | "invalid_project";

export type MembershipValidationResult =
  | { ok: true; memberships: NormalizedMembershipPlan[] }
  | { ok: false; conflicts: MembershipConflict[] };

function toDate(value: Date | string | null | undefined, fallback: Date): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return fallback;
}

function compareMembershipOrder(
  left: Pick<NormalizedMembershipPlan, "joinedAt" | "sourceOrder" | "projectId">,
  right: Pick<NormalizedMembershipPlan, "joinedAt" | "sourceOrder" | "projectId">,
): number {
  const joinedDelta = left.joinedAt.getTime() - right.joinedAt.getTime();
  if (joinedDelta !== 0) {
    return joinedDelta;
  }
  if (left.sourceOrder !== right.sourceOrder) {
    return left.sourceOrder - right.sourceOrder;
  }
  return left.projectId.localeCompare(right.projectId);
}

export function buildMembershipProvenance(input: {
  method: LeadProjectMembershipProvenanceMethod;
  source?: string;
  notes?: string;
  appliedAt?: Date | string;
  hubspotContactId?: string;
  hubspotAssociationId?: string;
  sourceMembershipDate?: Date | string | null;
  sourceOrder?: number;
}): LeadProjectMembershipProvenance {
  const appliedAt = toDate(input.appliedAt ?? null, new Date()).toISOString();
  const provenance: LeadProjectMembershipProvenance = {
    method: input.method,
    source: input.source ?? input.method,
    appliedAt,
    notes: input.notes ?? "",
  };
  if (input.hubspotContactId) {
    provenance.hubspotContactId = input.hubspotContactId;
  }
  if (input.hubspotAssociationId) {
    provenance.hubspotAssociationId = input.hubspotAssociationId;
  }
  if (input.sourceMembershipDate) {
    provenance.sourceMembershipDate = toDate(
      input.sourceMembershipDate,
      new Date(appliedAt),
    ).toISOString();
  }
  if (input.sourceOrder != null) {
    provenance.sourceOrder = input.sourceOrder;
  }
  return provenance;
}

export function sortMembershipsByHistory<
  T extends Pick<NormalizedMembershipPlan, "joinedAt" | "sourceOrder" | "projectId">,
>(memberships: T[]): T[] {
  return [...memberships].sort(compareMembershipOrder);
}

/**
 * Primary is the earliest membership by joinedAt, then sourceOrder, then projectId.
 * Used for historical HubSpot association import — not for deliberate UI primary changes.
 */
export function selectEarliestPrimary<T extends MembershipHistoryCandidate>(
  candidates: T[],
  fallbackNow: Date = new Date(),
): T | null {
  if (candidates.length === 0) {
    return null;
  }

  const ranked = candidates
    .filter((item) => Boolean(item.projectId?.trim()))
    .map((item, index) => ({
      item,
      joinedAt: toDate(item.joinedAt, fallbackNow),
      sourceOrder: item.sourceOrder ?? index,
      projectId: item.projectId,
    }))
    .sort(compareMembershipOrder);

  return ranked[0]?.item ?? null;
}

export function detectMembershipConflicts(
  candidates: MembershipHistoryCandidate[],
): MembershipConflict[] {
  const conflicts: MembershipConflict[] = [];
  if (candidates.length === 0) {
    return ["empty_memberships"];
  }

  const seen = new Set<string>();
  let primaryCount = 0;

  for (const item of candidates) {
    const projectId = item.projectId?.trim() ?? "";
    if (!projectId) {
      conflicts.push("invalid_project");
      continue;
    }
    if (seen.has(projectId)) {
      conflicts.push("duplicate_project");
    }
    seen.add(projectId);
    if (item.isPrimary) {
      primaryCount += 1;
    }
  }

  if (primaryCount === 0) {
    conflicts.push("missing_primary");
  } else if (primaryCount > 1) {
    conflicts.push("multiple_primaries");
  }

  return [...new Set(conflicts)];
}

/**
 * Deduplicate by projectId (first occurrence wins), assign sourceOrder, and
 * force exactly one primary. When `preferEarliestPrimary` is true (historical
 * import), primary is the earliest joinedAt/sourceOrder. Otherwise the first
 * explicit isPrimary (or the first membership) is kept.
 */
export function normalizeMembershipPlan(
  candidates: MembershipHistoryCandidate[],
  options: {
    fallbackNow?: Date;
    preferEarliestPrimary?: boolean;
  } = {},
): MembershipValidationResult {
  const fallbackNow = options.fallbackNow ?? new Date();
  const seen = new Set<string>();
  const memberships: NormalizedMembershipPlan[] = [];

  for (const [index, item] of candidates.entries()) {
    const projectId = item.projectId?.trim() ?? "";
    if (!projectId || seen.has(projectId)) {
      continue;
    }
    seen.add(projectId);
    memberships.push({
      projectId,
      isPrimary: false,
      joinedAt: toDate(item.joinedAt, fallbackNow),
      sourceOrder: item.sourceOrder ?? index,
    });
  }

  if (memberships.length === 0) {
    return { ok: false, conflicts: ["empty_memberships"] };
  }

  const ordered = sortMembershipsByHistory(memberships);
  let primaryProjectId: string;
  if (options.preferEarliestPrimary) {
    primaryProjectId = ordered[0]!.projectId;
  } else {
    const explicit = candidates.find(
      (item) => item.isPrimary && seen.has(item.projectId),
    );
    primaryProjectId = explicit?.projectId ?? ordered[0]!.projectId;
  }

  for (const membership of ordered) {
    membership.isPrimary = membership.projectId === primaryProjectId;
  }

  return { ok: true, memberships: ordered };
}

/**
 * Backfill / historical resolve:
 * - Ordered history present → earliest membership is primary.
 * - No history → retain the contact's current project as the sole primary.
 */
export function planContactProjectMemberships(input: {
  currentProjectId?: string | null;
  history?: MembershipHistoryCandidate[] | null;
  fallbackNow?: Date;
}): MembershipValidationResult {
  const fallbackNow = input.fallbackNow ?? new Date();
  const history = (input.history ?? []).filter((item) => item.projectId?.trim());

  if (history.length > 0) {
    return normalizeMembershipPlan(history, {
      fallbackNow,
      preferEarliestPrimary: true,
    });
  }

  const currentProjectId = input.currentProjectId?.trim() ?? "";
  if (!currentProjectId) {
    return { ok: false, conflicts: ["empty_memberships"] };
  }

  return {
    ok: true,
    memberships: [
      {
        projectId: currentProjectId,
        isPrimary: true,
        joinedAt: fallbackNow,
        sourceOrder: 0,
      },
    ],
  };
}

export function primaryProjectIdFromPlan(
  memberships: Array<Pick<NormalizedMembershipPlan, "projectId" | "isPrimary">>,
): string | null {
  return memberships.find((item) => item.isPrimary)?.projectId ?? null;
}

export function compactProjectMembershipLabel(input: {
  primaryName: string | null | undefined;
  secondaryCount: number;
}): string {
  const primary = input.primaryName?.trim() || "—";
  if (input.secondaryCount <= 0) {
    return primary;
  }
  return `${primary} +${input.secondaryCount}`;
}
