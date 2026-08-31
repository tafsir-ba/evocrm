import {
  CAMPAIGN_ENROLLMENT_POLICY_KEY,
  readCampaignEnrollmentPolicy,
} from "@/lib/campaign-enrollment-guard";
import {
  parseHubSpotContactIdFromIdempotencyKey,
  type LeadIntelligenceProvenance,
} from "@/lib/lead-intelligence";

export const LEAD_DUPLICATE_RECONCILIATION_ACTION = "lead.duplicate_reconciled";
export const LEAD_DUPLICATE_ARCHIVE_REASON = "duplicate_of_canonical";

export const PROJECT_SCOPED_LEAD_EMAIL_UNIQUE_INDEX =
  "workspaceId_1_projectId_1_emailNormalized_1";
export const LEAD_IDEMPOTENCY_UNIQUE_INDEX =
  "workspaceId_1_attributes.integration.integrationId_1_attributes.integration.idempotencyKey_1";
export const LEGACY_LEAD_EMAIL_UNIQUE_INDEX = "workspaceId_1_emailNormalized_1";

export const LEAD_EMAIL_UNIQUE_INDEX_SPEC = {
  keys: { workspaceId: 1, projectId: 1, emailNormalized: 1 } as const,
  name: PROJECT_SCOPED_LEAD_EMAIL_UNIQUE_INDEX,
  unique: true as const,
  // Atlas rejects $ne in partial indexes. Empty strings are stored as null.
  partialFilterExpression: {
    emailNormalized: { $type: "string" },
    archivedAt: null,
  },
};

export const LEAD_IDEMPOTENCY_UNIQUE_INDEX_SPEC = {
  keys: {
    workspaceId: 1,
    "attributes.integration.integrationId": 1,
    "attributes.integration.idempotencyKey": 1,
  } as const,
  name: LEAD_IDEMPOTENCY_UNIQUE_INDEX,
  unique: true as const,
  partialFilterExpression: {
    "attributes.integration.idempotencyKey": { $type: "string" },
    archivedAt: null,
  },
};

export type LeadDuplicateKind = "email" | "idempotency_key";

export type LeadDuplicateSnapshot = {
  id: string;
  workspaceId: string;
  projectId: string;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
  emailNormalized: string | null;
  notes: string | null;
  phone: string | null;
  phoneNormalized: string | null;
  language: string | null;
  companyId: string | null;
  ownerId: string | null;
  assignedTo: string | null;
  sourceId: string | null;
  industry: string | null;
  jobTitle: string | null;
  stateRegion: string | null;
  tags: string[];
  attributes: Record<string, unknown>;
  intelligenceProvenance: LeadIntelligenceProvenance;
  associationScore: number;
};

export type CanonicalSelection = {
  canonicalId: string;
  duplicateIds: string[];
};

export function evaluateLeadUniqueIndexWriteGate(input: {
  emailDupGroups: number;
  keyDupGroups: number;
  emailUniqueIndexPresent: boolean;
  idempotencyUniqueIndexPresent: boolean;
}): { ready: boolean; blockers: string[] } {
  const blockers: string[] = [];
  if (input.emailDupGroups > 0) {
    blockers.push("active_email_duplicate_groups");
  }
  if (input.keyDupGroups > 0) {
    blockers.push("active_idempotency_duplicate_groups");
  }
  if (!input.emailUniqueIndexPresent) {
    blockers.push("email_unique_index_missing");
  }
  if (!input.idempotencyUniqueIndexPresent) {
    blockers.push("idempotency_unique_index_missing");
  }
  return { ready: blockers.length === 0, blockers };
}

export function selectCanonicalLead(leads: LeadDuplicateSnapshot[]): CanonicalSelection {
  if (leads.length < 2) {
    throw new Error("duplicate_group_too_small");
  }

  const ranked = [...leads].sort((left, right) => {
    if (left.associationScore !== right.associationScore) {
      return right.associationScore - left.associationScore;
    }
    const created = left.createdAt.getTime() - right.createdAt.getTime();
    if (created !== 0) {
      return created;
    }
    return left.id.localeCompare(right.id);
  });

  return {
    canonicalId: ranked[0]!.id,
    duplicateIds: ranked.slice(1).map((lead) => lead.id),
  };
}

export function unionDuplicateIdGroups(groups: string[][]): string[][] {
  const parent = new Map<string, string>();

  function find(id: string): string {
    const current = parent.get(id) ?? id;
    if (current === id) {
      return id;
    }
    const root = find(current);
    parent.set(id, root);
    return root;
  }

  function union(left: string, right: string): void {
    const a = find(left);
    const b = find(right);
    if (a !== b) {
      parent.set(a, b);
    }
  }

  for (const group of groups) {
    for (const id of group) {
      if (!parent.has(id)) {
        parent.set(id, id);
      }
    }
    for (let index = 1; index < group.length; index += 1) {
      union(group[0]!, group[index]!);
    }
  }

  const buckets = new Map<string, string[]>();
  for (const id of parent.keys()) {
    const root = find(id);
    const bucket = buckets.get(root) ?? [];
    bucket.push(id);
    buckets.set(root, bucket);
  }

  return [...buckets.values()]
    .map((ids) => [...new Set(ids)].sort())
    .filter((ids) => ids.length > 1)
    .sort((left, right) => left[0]!.localeCompare(right[0]!));
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))].sort();
}

export function collectHubSpotSourceIds(
  attributes: Record<string, unknown> | null | undefined,
): { contactIds: string[]; idempotencyKeys: string[] } {
  const integration = asRecord(asRecord(attributes).integration);
  const key = typeof integration.idempotencyKey === "string" ? integration.idempotencyKey : null;
  const externalId = typeof integration.externalId === "string" ? integration.externalId : null;
  const fromKey = parseHubSpotContactIdFromIdempotencyKey(key);
  const mergedContacts = Array.isArray(integration.mergedHubSpotContactIds)
    ? integration.mergedHubSpotContactIds.map((value) => String(value))
    : [];
  const mergedKeys = Array.isArray(integration.mergedIdempotencyKeys)
    ? integration.mergedIdempotencyKeys.map((value) => String(value))
    : [];

  return {
    contactIds: uniqueStrings([fromKey, externalId, ...mergedContacts]),
    idempotencyKeys: uniqueStrings([key, ...mergedKeys]),
  };
}

export function mergeLeadNotes(
  canonical: string | null | undefined,
  duplicate: string | null | undefined,
): string | null {
  const left = canonical?.trim() || "";
  const right = duplicate?.trim() || "";
  if (!left) {
    return right || null;
  }
  if (!right || left === right) {
    return left;
  }
  return `${left}\n\n---\n${right}`;
}

export function mergeIntelligenceProvenance(
  canonical: LeadIntelligenceProvenance | null | undefined,
  duplicate: LeadIntelligenceProvenance | null | undefined,
): LeadIntelligenceProvenance {
  const next: LeadIntelligenceProvenance = { ...(canonical ?? {}) };
  for (const [field, provenance] of Object.entries(duplicate ?? {})) {
    const key = field as keyof LeadIntelligenceProvenance;
    if (!next[key] && provenance) {
      next[key] = provenance;
    }
  }
  return next;
}

export function mergeLeadAttributes(input: {
  canonical: Record<string, unknown>;
  duplicate: Record<string, unknown>;
  archivedLeadId: string;
}): Record<string, unknown> {
  const canonicalIntegration = asRecord(input.canonical.integration);
  const duplicateIntegration = asRecord(input.duplicate.integration);
  const canonicalSources = collectHubSpotSourceIds(input.canonical);
  const duplicateSources = collectHubSpotSourceIds(input.duplicate);
  const archivedLeadIds = uniqueStrings([
    ...(Array.isArray(canonicalIntegration.mergedArchivedLeadIds)
      ? canonicalIntegration.mergedArchivedLeadIds.map((value) => String(value))
      : []),
    input.archivedLeadId,
  ]);

  const mergedIntegration = {
    ...duplicateIntegration,
    ...canonicalIntegration,
    mergedHubSpotContactIds: uniqueStrings([
      ...canonicalSources.contactIds,
      ...duplicateSources.contactIds,
    ]),
    mergedIdempotencyKeys: uniqueStrings([
      ...canonicalSources.idempotencyKeys,
      ...duplicateSources.idempotencyKeys,
    ]),
    mergedArchivedLeadIds: archivedLeadIds,
  };

  const campaignGuard =
    readCampaignEnrollmentPolicy(input.canonical) ??
    readCampaignEnrollmentPolicy(input.duplicate);

  return {
    ...input.duplicate,
    ...input.canonical,
    integration: mergedIntegration,
    ...(campaignGuard ? { [CAMPAIGN_ENROLLMENT_POLICY_KEY]: campaignGuard } : {}),
  };
}

export function buildDuplicateArchiveAttributes(input: {
  canonicalLeadId: string;
  runId: string;
  archivedAt: Date;
}): Record<string, unknown> {
  return {
    duplicateReconciliation: {
      canonicalLeadId: input.canonicalLeadId,
      runId: input.runId,
      archivedReason: LEAD_DUPLICATE_ARCHIVE_REASON,
      archivedAt: input.archivedAt.toISOString(),
    },
  };
}

export function preferFilled<T>(canonical: T | null | undefined, duplicate: T | null | undefined): T | null {
  if (canonical !== null && canonical !== undefined && canonical !== "") {
    return canonical;
  }
  if (duplicate !== null && duplicate !== undefined && duplicate !== "") {
    return duplicate;
  }
  return canonical ?? duplicate ?? null;
}

export function planMembershipRemap(input: {
  canonicalLeadId: string;
  duplicateLeadId: string;
  canonicalProjectIds: string[];
  duplicateMemberships: Array<{ id: string; projectId: string }>;
}): {
  archiveMembershipIds: string[];
  remapMembershipIds: string[];
} {
  const canonicalProjects = new Set(input.canonicalProjectIds);
  const archiveMembershipIds: string[] = [];
  const remapMembershipIds: string[] = [];

  for (const membership of input.duplicateMemberships) {
    if (canonicalProjects.has(membership.projectId)) {
      archiveMembershipIds.push(membership.id);
    } else {
      remapMembershipIds.push(membership.id);
    }
  }

  return { archiveMembershipIds, remapMembershipIds };
}

export function planEnrollmentRemap(input: {
  canonicalCampaignIds: string[];
  duplicateEnrollments: Array<{ id: string; campaignId: string; status: string }>;
}): {
  remapEnrollmentIds: string[];
  pauseEnrollmentIds: string[];
} {
  const canonicalCampaigns = new Set(input.canonicalCampaignIds);
  const remapEnrollmentIds: string[] = [];
  const pauseEnrollmentIds: string[] = [];

  for (const enrollment of input.duplicateEnrollments) {
    const active = enrollment.status === "active" || enrollment.status === "paused";
    if (active && canonicalCampaigns.has(enrollment.campaignId)) {
      pauseEnrollmentIds.push(enrollment.id);
    } else {
      remapEnrollmentIds.push(enrollment.id);
    }
  }

  return { remapEnrollmentIds, pauseEnrollmentIds };
}
