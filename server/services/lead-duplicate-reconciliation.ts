import "server-only";

import mongoose from "mongoose";

import { createAuditLog } from "@/server/audit/create-audit-log";
import { ActivityModel } from "@/models/activity";
import { CampaignEnrollmentModel } from "@/models/campaign-enrollment";
import { CampaignSendModel } from "@/models/campaign-send";
import { DocumentModel } from "@/models/document";
import { HubSpotMigrationRunModel } from "@/models/hubspot-migration-run";
import { LeadProjectMembershipModel } from "@/models/lead-project-membership";
import { LeadModel } from "@/models/lead";
import { OpportunityModel } from "@/models/opportunity";
import {
  LEAD_DUPLICATE_ARCHIVE_REASON,
  LEAD_DUPLICATE_RECONCILIATION_ACTION,
  LEAD_EMAIL_UNIQUE_INDEX_SPEC,
  LEAD_IDEMPOTENCY_UNIQUE_INDEX,
  LEAD_IDEMPOTENCY_UNIQUE_INDEX_SPEC,
  LEGACY_LEAD_EMAIL_UNIQUE_INDEX,
  PROJECT_SCOPED_LEAD_EMAIL_UNIQUE_INDEX,
  buildDuplicateArchiveAttributes,
  evaluateLeadUniqueIndexWriteGate,
  mergeIntelligenceProvenance,
  mergeLeadAttributes,
  mergeLeadNotes,
  planEnrollmentRemap,
  planMembershipRemap,
  preferFilled,
  selectCanonicalLead,
  unionDuplicateIdGroups,
  type LeadDuplicateSnapshot,
} from "@/lib/lead-duplicate-reconciliation";
import { connectDb } from "@/server/db/mongoose";

mongoose.set("autoIndex", false);

export {
  LEAD_IDEMPOTENCY_UNIQUE_INDEX,
  LEGACY_LEAD_EMAIL_UNIQUE_INDEX,
  PROJECT_SCOPED_LEAD_EMAIL_UNIQUE_INDEX,
};

export type LeadDuplicateCounts = {
  emailDupGroups: number;
  extraEmailDocs: number;
  keyDupGroups: number;
  extraKeyDocs: number;
};

export type LeadDuplicateGroupPlan = {
  kinds: string[];
  canonicalId: string;
  duplicateIds: string[];
  workspaceId: string;
  projectId: string;
  alreadyArchived: boolean;
};

export type LeadDuplicateReconciliationResult = {
  dryRun: boolean;
  runId: string;
  before: LeadDuplicateCounts;
  after: LeadDuplicateCounts;
  groupsFound: number;
  groupsReconciled: number;
  leadsArchived: number;
  membershipsArchived: number;
  membershipsRemapped: number;
  activitiesRemapped: number;
  opportunitiesRemapped: number;
  documentsRemapped: number;
  enrollmentsRemapped: number;
  enrollmentsPaused: number;
  indexesEnsured: boolean;
  indexNames: string[];
  writeGate: { ready: boolean; blockers: string[] };
};

function toId(value: unknown): string {
  return String(value);
}

async function loadDuplicateIdGroups(): Promise<{
  emailGroups: string[][];
  keyGroups: string[][];
  counts: LeadDuplicateCounts;
}> {
  await connectDb();
  const [emailGroups, keyGroups] = await Promise.all([
    LeadModel.aggregate<{ _id: unknown; ids: mongoose.Types.ObjectId[]; count: number }>([
      {
        $match: {
          archivedAt: null,
          emailNormalized: { $type: "string", $ne: "" },
        },
      },
      {
        $group: {
          _id: {
            workspaceId: "$workspaceId",
            projectId: "$projectId",
            emailNormalized: "$emailNormalized",
          },
          ids: { $push: "$_id" },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ]),
    LeadModel.aggregate<{ _id: unknown; ids: mongoose.Types.ObjectId[]; count: number }>([
      {
        $match: {
          archivedAt: null,
          "attributes.integration.idempotencyKey": { $type: "string", $ne: "" },
        },
      },
      {
        $group: {
          _id: {
            workspaceId: "$workspaceId",
            integrationId: "$attributes.integration.integrationId",
            idempotencyKey: "$attributes.integration.idempotencyKey",
          },
          ids: { $push: "$_id" },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ]),
  ]);

  return {
    emailGroups: emailGroups.map((group) => group.ids.map(toId)),
    keyGroups: keyGroups.map((group) => group.ids.map(toId)),
    counts: {
      emailDupGroups: emailGroups.length,
      extraEmailDocs: emailGroups.reduce((sum, group) => sum + (group.count - 1), 0),
      keyDupGroups: keyGroups.length,
      extraKeyDocs: keyGroups.reduce((sum, group) => sum + (group.count - 1), 0),
    },
  };
}

export async function countActiveLeadDuplicateGroups(): Promise<LeadDuplicateCounts> {
  const { counts } = await loadDuplicateIdGroups();
  return counts;
}

async function listIndexNames(): Promise<string[]> {
  await connectDb();
  const indexes = await LeadModel.collection.indexes();
  return indexes.map((index) => index.name).filter((name): name is string => Boolean(name));
}

export async function evaluateLiveLeadUniqueIndexWriteGate(): Promise<{
  ready: boolean;
  blockers: string[];
  counts: LeadDuplicateCounts;
  indexNames: string[];
}> {
  const [counts, indexNames] = await Promise.all([
    countActiveLeadDuplicateGroups(),
    listIndexNames(),
  ]);
  const writeGate = evaluateLeadUniqueIndexWriteGate({
    emailDupGroups: counts.emailDupGroups,
    keyDupGroups: counts.keyDupGroups,
    emailUniqueIndexPresent: indexNames.includes(PROJECT_SCOPED_LEAD_EMAIL_UNIQUE_INDEX),
    idempotencyUniqueIndexPresent: indexNames.includes(LEAD_IDEMPOTENCY_UNIQUE_INDEX),
  });
  return { ...writeGate, counts, indexNames };
}

export async function assertLeadDuplicateWriteGate(): Promise<void> {
  const gate = await evaluateLiveLeadUniqueIndexWriteGate();
  if (!gate.ready) {
    throw new Error(`lead_unique_index_gate_blocked:${gate.blockers.join(",")}`);
  }
}

export async function ensureLeadUniqueIndexes(
  options: { dryRun?: boolean } = {},
): Promise<{
  dryRun: boolean;
  legacyIndexDropped: boolean;
  emailIndexEnsured: boolean;
  idempotencyIndexEnsured: boolean;
  indexesAfter: string[];
}> {
  const dryRun = options.dryRun ?? false;
  const counts = await countActiveLeadDuplicateGroups();
  if ((counts.emailDupGroups > 0 || counts.keyDupGroups > 0) && !dryRun) {
    throw new Error("lead_unique_indexes_blocked_by_active_duplicates");
  }

  const names = await listIndexNames();
  let legacyIndexDropped = false;
  if (names.includes(LEGACY_LEAD_EMAIL_UNIQUE_INDEX) && !dryRun) {
    await LeadModel.collection.dropIndex(LEGACY_LEAD_EMAIL_UNIQUE_INDEX);
    legacyIndexDropped = true;
  }

  if (!dryRun) {
    await LeadModel.collection.createIndex(LEAD_EMAIL_UNIQUE_INDEX_SPEC.keys, {
      unique: LEAD_EMAIL_UNIQUE_INDEX_SPEC.unique,
      name: LEAD_EMAIL_UNIQUE_INDEX_SPEC.name,
      partialFilterExpression: LEAD_EMAIL_UNIQUE_INDEX_SPEC.partialFilterExpression,
    });
    await LeadModel.collection.createIndex(LEAD_IDEMPOTENCY_UNIQUE_INDEX_SPEC.keys, {
      unique: LEAD_IDEMPOTENCY_UNIQUE_INDEX_SPEC.unique,
      name: LEAD_IDEMPOTENCY_UNIQUE_INDEX_SPEC.name,
      partialFilterExpression: LEAD_IDEMPOTENCY_UNIQUE_INDEX_SPEC.partialFilterExpression,
    });
  }

  return {
    dryRun,
    legacyIndexDropped,
    emailIndexEnsured:
      dryRun
        ? names.includes(PROJECT_SCOPED_LEAD_EMAIL_UNIQUE_INDEX)
        : true,
    idempotencyIndexEnsured:
      dryRun ? names.includes(LEAD_IDEMPOTENCY_UNIQUE_INDEX) : true,
    indexesAfter: dryRun ? names : await listIndexNames(),
  };
}

function toSnapshot(
  lead: {
    _id: mongoose.Types.ObjectId;
    workspaceId: mongoose.Types.ObjectId;
    projectId: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
    archivedAt?: Date | null;
    emailNormalized?: string | null;
    notes?: string | null;
    phone?: string | null;
    phoneNormalized?: string | null;
    language?: string | null;
    companyId?: mongoose.Types.ObjectId | null;
    ownerId?: mongoose.Types.ObjectId | null;
    assignedTo?: mongoose.Types.ObjectId | null;
    sourceId?: mongoose.Types.ObjectId | null;
    industry?: string | null;
    jobTitle?: string | null;
    stateRegion?: string | null;
    tags?: mongoose.Types.ObjectId[];
    attributes?: Record<string, unknown>;
    intelligenceProvenance?: LeadDuplicateSnapshot["intelligenceProvenance"];
  },
  associationScore: number,
): LeadDuplicateSnapshot {
  return {
    id: lead._id.toString(),
    workspaceId: lead.workspaceId.toString(),
    projectId: lead.projectId.toString(),
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
    archivedAt: lead.archivedAt ?? null,
    emailNormalized: lead.emailNormalized ?? null,
    notes: lead.notes ?? null,
    phone: lead.phone ?? null,
    phoneNormalized: lead.phoneNormalized ?? null,
    language: lead.language ?? null,
    companyId: lead.companyId?.toString() ?? null,
    ownerId: lead.ownerId?.toString() ?? null,
    assignedTo: lead.assignedTo?.toString() ?? null,
    sourceId: lead.sourceId?.toString() ?? null,
    industry: lead.industry ?? null,
    jobTitle: lead.jobTitle ?? null,
    stateRegion: lead.stateRegion ?? null,
    tags: (lead.tags ?? []).map((tag) => tag.toString()),
    attributes: (lead.attributes as Record<string, unknown>) ?? {},
    intelligenceProvenance: lead.intelligenceProvenance ?? {},
    associationScore,
  };
}

async function associationScoreFor(
  workspaceId: mongoose.Types.ObjectId,
  leadId: mongoose.Types.ObjectId,
): Promise<number> {
  const [memberships, activities, opportunities, documents, enrollments] = await Promise.all([
    LeadProjectMembershipModel.countDocuments({
      workspaceId,
      leadId,
      archivedAt: null,
    }),
    ActivityModel.countDocuments({ workspaceId, leadId, archivedAt: null }),
    OpportunityModel.countDocuments({ workspaceId, leadId, archivedAt: null }),
    DocumentModel.countDocuments({
      workspaceId,
      linkedEntityType: "lead",
      linkedEntityId: leadId,
      archivedAt: null,
    }),
    CampaignEnrollmentModel.countDocuments({ workspaceId, leadId }),
  ]);
  return memberships + activities + opportunities + documents + enrollments;
}

async function applyGroup(input: {
  runId: string;
  actorId: string;
  dryRun: boolean;
  leadById: Map<string, ReturnType<typeof toSnapshot> & { rawId: mongoose.Types.ObjectId }>;
  duplicateIds: string[];
  canonicalId: string;
  now: Date;
}): Promise<{
  archived: number;
  membershipsArchived: number;
  membershipsRemapped: number;
  activitiesRemapped: number;
  opportunitiesRemapped: number;
  documentsRemapped: number;
  enrollmentsRemapped: number;
  enrollmentsPaused: number;
}> {
  const canonical = input.leadById.get(input.canonicalId);
  if (!canonical) {
    throw new Error("canonical_lead_missing");
  }
  const workspaceObjectId = new mongoose.Types.ObjectId(canonical.workspaceId);
  const canonicalObjectId = new mongoose.Types.ObjectId(canonical.id);

  let membershipsArchived = 0;
  let membershipsRemapped = 0;
  let activitiesRemapped = 0;
  let opportunitiesRemapped = 0;
  let documentsRemapped = 0;
  let enrollmentsRemapped = 0;
  let enrollmentsPaused = 0;
  let archived = 0;

  let mergedAttributes = canonical.attributes;
  let mergedNotes = canonical.notes;
  let mergedProvenance = canonical.intelligenceProvenance;
  let mergedTags = [...canonical.tags];
  let mergedPhone = canonical.phone;
  let mergedPhoneNormalized = canonical.phoneNormalized;
  let mergedLanguage = canonical.language;
  let mergedCompanyId = canonical.companyId;
  let mergedOwnerId = canonical.ownerId;
  let mergedAssignedTo = canonical.assignedTo;
  let mergedSourceId = canonical.sourceId;
  let mergedIndustry = canonical.industry;
  let mergedJobTitle = canonical.jobTitle;
  let mergedStateRegion = canonical.stateRegion;

  for (const duplicateId of input.duplicateIds) {
    const duplicate = input.leadById.get(duplicateId);
    if (!duplicate || duplicate.archivedAt) {
      continue;
    }
    const duplicateObjectId = new mongoose.Types.ObjectId(duplicateId);

    const [canonicalMemberships, duplicateMemberships, canonicalEnrollments, duplicateEnrollments] =
      await Promise.all([
        LeadProjectMembershipModel.find({
          workspaceId: workspaceObjectId,
          leadId: canonicalObjectId,
          archivedAt: null,
        }).lean(),
        LeadProjectMembershipModel.find({
          workspaceId: workspaceObjectId,
          leadId: duplicateObjectId,
          archivedAt: null,
        }).lean(),
        CampaignEnrollmentModel.find({
          workspaceId: workspaceObjectId,
          leadId: canonicalObjectId,
          status: { $in: ["active", "paused"] },
        }).lean(),
        CampaignEnrollmentModel.find({
          workspaceId: workspaceObjectId,
          leadId: duplicateObjectId,
        }).lean(),
      ]);

    const membershipPlan = planMembershipRemap({
      canonicalLeadId: canonical.id,
      duplicateLeadId: duplicateId,
      canonicalProjectIds: canonicalMemberships.map((row) => toId(row.projectId)),
      duplicateMemberships: duplicateMemberships.map((row) => ({
        id: toId(row._id),
        projectId: toId(row.projectId),
      })),
    });
    const enrollmentPlan = planEnrollmentRemap({
      canonicalCampaignIds: canonicalEnrollments.map((row) => toId(row.campaignId)),
      duplicateEnrollments: duplicateEnrollments.map((row) => ({
        id: toId(row._id),
        campaignId: toId(row.campaignId),
        status: String(row.status),
      })),
    });

    mergedAttributes = mergeLeadAttributes({
      canonical: mergedAttributes,
      duplicate: duplicate.attributes,
      archivedLeadId: duplicateId,
    });
    mergedNotes = mergeLeadNotes(mergedNotes, duplicate.notes);
    mergedProvenance = mergeIntelligenceProvenance(
      mergedProvenance,
      duplicate.intelligenceProvenance,
    );
    mergedTags = [...new Set([...mergedTags, ...duplicate.tags])];
    mergedPhone = preferFilled(mergedPhone, duplicate.phone);
    mergedPhoneNormalized = preferFilled(mergedPhoneNormalized, duplicate.phoneNormalized);
    mergedLanguage = preferFilled(mergedLanguage, duplicate.language);
    mergedCompanyId = preferFilled(mergedCompanyId, duplicate.companyId);
    mergedOwnerId = preferFilled(mergedOwnerId, duplicate.ownerId);
    mergedAssignedTo = preferFilled(mergedAssignedTo, duplicate.assignedTo);
    mergedSourceId = preferFilled(mergedSourceId, duplicate.sourceId);
    mergedIndustry = preferFilled(mergedIndustry, duplicate.industry);
    mergedJobTitle = preferFilled(mergedJobTitle, duplicate.jobTitle);
    mergedStateRegion = preferFilled(mergedStateRegion, duplicate.stateRegion);

    if (!input.dryRun) {
      if (membershipPlan.archiveMembershipIds.length > 0) {
        const result = await LeadProjectMembershipModel.updateMany(
          {
            workspaceId: workspaceObjectId,
            _id: {
              $in: membershipPlan.archiveMembershipIds.map(
                (id) => new mongoose.Types.ObjectId(id),
              ),
            },
          },
          { $set: { archivedAt: input.now, isPrimary: false } },
        );
        membershipsArchived += result.modifiedCount;
      }
      if (membershipPlan.remapMembershipIds.length > 0) {
        const result = await LeadProjectMembershipModel.updateMany(
          {
            workspaceId: workspaceObjectId,
            _id: {
              $in: membershipPlan.remapMembershipIds.map(
                (id) => new mongoose.Types.ObjectId(id),
              ),
            },
          },
          { $set: { leadId: canonicalObjectId } },
        );
        membershipsRemapped += result.modifiedCount;
      }

      const activityResult = await ActivityModel.updateMany(
        { workspaceId: workspaceObjectId, leadId: duplicateObjectId },
        { $set: { leadId: canonicalObjectId } },
      );
      activitiesRemapped += activityResult.modifiedCount;

      const opportunityResult = await OpportunityModel.updateMany(
        { workspaceId: workspaceObjectId, leadId: duplicateObjectId },
        { $set: { leadId: canonicalObjectId } },
      );
      opportunitiesRemapped += opportunityResult.modifiedCount;

      const documentResult = await DocumentModel.updateMany(
        {
          workspaceId: workspaceObjectId,
          linkedEntityType: "lead",
          linkedEntityId: duplicateObjectId,
        },
        { $set: { linkedEntityId: canonicalObjectId } },
      );
      documentsRemapped += documentResult.modifiedCount;

      if (enrollmentPlan.remapEnrollmentIds.length > 0) {
        const result = await CampaignEnrollmentModel.updateMany(
          {
            workspaceId: workspaceObjectId,
            _id: {
              $in: enrollmentPlan.remapEnrollmentIds.map(
                (id) => new mongoose.Types.ObjectId(id),
              ),
            },
          },
          { $set: { leadId: canonicalObjectId } },
        );
        enrollmentsRemapped += result.modifiedCount;
      }
      if (enrollmentPlan.pauseEnrollmentIds.length > 0) {
        const result = await CampaignEnrollmentModel.updateMany(
          {
            workspaceId: workspaceObjectId,
            _id: {
              $in: enrollmentPlan.pauseEnrollmentIds.map(
                (id) => new mongoose.Types.ObjectId(id),
              ),
            },
          },
          {
            $set: {
              status: "paused",
              enrollmentReason: {
                pausedBy: "lead_duplicate_reconciliation",
                canonicalLeadId: canonical.id,
                runId: input.runId,
              },
            },
          },
        );
        enrollmentsPaused += result.modifiedCount;
      }

      await CampaignSendModel.updateMany(
        { workspaceId: workspaceObjectId, leadId: duplicateObjectId },
        { $set: { leadId: canonicalObjectId } },
      );
      try {
        await HubSpotMigrationRunModel.updateMany(
          { workspaceId: workspaceObjectId, "records.leadId": duplicateObjectId },
          { $set: { "records.$[row].leadId": canonicalObjectId } },
          { arrayFilters: [{ "row.leadId": duplicateObjectId }] },
        );
      } catch {
        // Historical run rows are audit-only; skip if the array filter is unsupported.
      }

      const archiveAttributes = {
        ...duplicate.attributes,
        ...buildDuplicateArchiveAttributes({
          canonicalLeadId: canonical.id,
          runId: input.runId,
          archivedAt: input.now,
        }),
      };
      await LeadModel.updateOne(
        { _id: duplicateObjectId, workspaceId: workspaceObjectId, archivedAt: null },
        {
          $set: {
            archivedAt: input.now,
            attributes: archiveAttributes,
          },
        },
      );
    } else {
      membershipsArchived += membershipPlan.archiveMembershipIds.length;
      membershipsRemapped += membershipPlan.remapMembershipIds.length;
      enrollmentsRemapped += enrollmentPlan.remapEnrollmentIds.length;
      enrollmentsPaused += enrollmentPlan.pauseEnrollmentIds.length;
    }

    archived += 1;

    if (!input.dryRun) {
      await createAuditLog({
        workspaceId: canonical.workspaceId,
        actorId: input.actorId,
        action: LEAD_DUPLICATE_RECONCILIATION_ACTION,
        entityType: "lead",
        entityId: duplicateId,
        before: {
          archivedAt: null,
          associationScore: duplicate.associationScore,
        },
        after: {
          archivedAt: input.now,
          canonicalLeadId: canonical.id,
          runId: input.runId,
          reason: LEAD_DUPLICATE_ARCHIVE_REASON,
          dryRun: false,
        },
      });
    }
  }

  if (!input.dryRun) {
    await LeadModel.updateOne(
      { _id: canonicalObjectId, workspaceId: workspaceObjectId },
      {
        $set: {
          attributes: mergedAttributes,
          notes: mergedNotes,
          intelligenceProvenance: mergedProvenance,
          tags: mergedTags.map((id) => new mongoose.Types.ObjectId(id)),
          phone: mergedPhone,
          phoneNormalized: mergedPhoneNormalized,
          language: mergedLanguage,
          companyId: mergedCompanyId ? new mongoose.Types.ObjectId(mergedCompanyId) : null,
          ownerId: mergedOwnerId ? new mongoose.Types.ObjectId(mergedOwnerId) : null,
          assignedTo: mergedAssignedTo ? new mongoose.Types.ObjectId(mergedAssignedTo) : null,
          sourceId: mergedSourceId ? new mongoose.Types.ObjectId(mergedSourceId) : null,
          industry: mergedIndustry,
          jobTitle: mergedJobTitle,
          stateRegion: mergedStateRegion,
        },
      },
    );
    await createAuditLog({
      workspaceId: canonical.workspaceId,
      actorId: input.actorId,
      action: LEAD_DUPLICATE_RECONCILIATION_ACTION,
      entityType: "lead",
      entityId: canonical.id,
      after: {
        canonicalLeadId: canonical.id,
        archivedDuplicateIds: input.duplicateIds,
        runId: input.runId,
        dryRun: false,
      },
    });
  }

  return {
    archived,
    membershipsArchived,
    membershipsRemapped,
    activitiesRemapped,
    opportunitiesRemapped,
    documentsRemapped,
    enrollmentsRemapped,
    enrollmentsPaused,
  };
}

export async function reconcileLeadDuplicates(options: {
  dryRun?: boolean;
  actorId: string;
  skipIndexes?: boolean;
}): Promise<LeadDuplicateReconciliationResult> {
  const dryRun = options.dryRun ?? true;
  const now = new Date();
  const runId = new mongoose.Types.ObjectId().toString();
  await connectDb();

  const loaded = await loadDuplicateIdGroups();
  const before = loaded.counts;
  const mergedGroups = unionDuplicateIdGroups([...loaded.emailGroups, ...loaded.keyGroups]);

  const allIds = [...new Set(mergedGroups.flat())].map((id) => new mongoose.Types.ObjectId(id));
  const leads = await LeadModel.find({ _id: { $in: allIds } }).lean();
  const leadById = new Map<
    string,
    ReturnType<typeof toSnapshot> & { rawId: mongoose.Types.ObjectId }
  >();

  for (const lead of leads) {
    const score = await associationScoreFor(lead.workspaceId, lead._id);
    leadById.set(lead._id.toString(), {
      ...toSnapshot(lead, score),
      rawId: lead._id,
    });
  }

  let groupsReconciled = 0;
  let leadsArchived = 0;
  let membershipsArchived = 0;
  let membershipsRemapped = 0;
  let activitiesRemapped = 0;
  let opportunitiesRemapped = 0;
  let documentsRemapped = 0;
  let enrollmentsRemapped = 0;
  let enrollmentsPaused = 0;

  for (const ids of mergedGroups) {
    const snapshots = ids
      .map((id) => leadById.get(id))
      .filter((lead): lead is NonNullable<typeof lead> => Boolean(lead));
    const active = snapshots.filter((lead) => !lead.archivedAt);
    if (active.length < 2) {
      continue;
    }
    const selection = selectCanonicalLead(active);
    const applied = await applyGroup({
      runId,
      actorId: options.actorId,
      dryRun,
      leadById,
      duplicateIds: selection.duplicateIds,
      canonicalId: selection.canonicalId,
      now,
    });
    groupsReconciled += 1;
    leadsArchived += applied.archived;
    membershipsArchived += applied.membershipsArchived;
    membershipsRemapped += applied.membershipsRemapped;
    activitiesRemapped += applied.activitiesRemapped;
    opportunitiesRemapped += applied.opportunitiesRemapped;
    documentsRemapped += applied.documentsRemapped;
    enrollmentsRemapped += applied.enrollmentsRemapped;
    enrollmentsPaused += applied.enrollmentsPaused;
  }

  let indexesEnsured = false;
  let indexNames = await listIndexNames();
  if (!dryRun && !options.skipIndexes) {
    const ensured = await ensureLeadUniqueIndexes({ dryRun: false });
    indexesEnsured = ensured.emailIndexEnsured && ensured.idempotencyIndexEnsured;
    indexNames = ensured.indexesAfter;
  }

  const after = dryRun ? before : await countActiveLeadDuplicateGroups();
  const writeGate = evaluateLeadUniqueIndexWriteGate({
    emailDupGroups: after.emailDupGroups,
    keyDupGroups: after.keyDupGroups,
    emailUniqueIndexPresent: indexNames.includes(PROJECT_SCOPED_LEAD_EMAIL_UNIQUE_INDEX),
    idempotencyUniqueIndexPresent: indexNames.includes(LEAD_IDEMPOTENCY_UNIQUE_INDEX),
  });

  return {
    dryRun,
    runId,
    before,
    after,
    groupsFound: mergedGroups.length,
    groupsReconciled,
    leadsArchived,
    membershipsArchived,
    membershipsRemapped,
    activitiesRemapped,
    opportunitiesRemapped,
    documentsRemapped,
    enrollmentsRemapped,
    enrollmentsPaused,
    indexesEnsured,
    indexNames,
    writeGate,
  };
}
