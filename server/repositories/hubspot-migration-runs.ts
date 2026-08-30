import "server-only";

import mongoose from "mongoose";

import {
  HubSpotMigrationRunModel,
  type HubSpotMigrationRunDocument,
  HUBSPOT_MIGRATION_RUN_STATUSES,
  HUBSPOT_MIGRATION_RUN_MODES,
  HUBSPOT_MIGRATION_RECORD_OUTCOMES,
} from "@/models/hubspot-migration-run";
import { connectDb } from "@/server/db/mongoose";

export type HubSpotMigrationRunStatus = (typeof HUBSPOT_MIGRATION_RUN_STATUSES)[number];
export type HubSpotMigrationRunMode = (typeof HUBSPOT_MIGRATION_RUN_MODES)[number];
export type HubSpotMigrationRecordOutcome =
  (typeof HUBSPOT_MIGRATION_RECORD_OUTCOMES)[number];

export type HubSpotMigrationRunRecordItem = {
  hubspotContactId: string;
  idempotencyKey: string;
  cohort: string;
  exclusions: string[];
  outcome: HubSpotMigrationRecordOutcome;
  unexpectedReason: string | null;
  leadId: string | null;
  destinationProjectId: string | null;
};

export type HubSpotMigrationRunRecord = {
  id: string;
  workspaceId: string;
  integrationId: string;
  portalId: string;
  destinationProjectId: string;
  destinationReference: string;
  manifestName: string;
  manifestChecksum: string;
  hubspotContactIds: string[];
  mode: HubSpotMigrationRunMode;
  status: HubSpotMigrationRunStatus;
  abortThreshold: number;
  unexpectedCount: number;
  createdCount: number;
  skippedCount: number;
  wouldCreateCount: number;
  aborted: boolean;
  abortReason: string | null;
  records: HubSpotMigrationRunRecordItem[];
  reconciliation: Record<string, unknown>;
  sideEffectGuard: Record<string, unknown>;
  startedAt: Date;
  completedAt: Date | null;
  actorId: string;
  createdAt: Date;
  updatedAt: Date;
};

function toRecord(document: HubSpotMigrationRunDocument): HubSpotMigrationRunRecord {
  return {
    id: document._id.toString(),
    workspaceId: document.workspaceId.toString(),
    integrationId: document.integrationId.toString(),
    portalId: document.portalId,
    destinationProjectId: document.destinationProjectId.toString(),
    destinationReference: document.destinationReference,
    manifestName: document.manifestName,
    manifestChecksum: document.manifestChecksum,
    hubspotContactIds: document.hubspotContactIds,
    mode: document.mode as HubSpotMigrationRunMode,
    status: document.status as HubSpotMigrationRunStatus,
    abortThreshold: document.abortThreshold,
    unexpectedCount: document.unexpectedCount,
    createdCount: document.createdCount,
    skippedCount: document.skippedCount,
    wouldCreateCount: document.wouldCreateCount,
    aborted: document.aborted,
    abortReason: document.abortReason ?? null,
    records: (document.records ?? []).map((record) => ({
      hubspotContactId: record.hubspotContactId,
      idempotencyKey: record.idempotencyKey,
      cohort: record.cohort,
      exclusions: record.exclusions ?? [],
      outcome: record.outcome as HubSpotMigrationRecordOutcome,
      unexpectedReason: record.unexpectedReason ?? null,
      leadId: record.leadId ? record.leadId.toString() : null,
      destinationProjectId: record.destinationProjectId
        ? record.destinationProjectId.toString()
        : null,
    })),
    reconciliation: (document.reconciliation as Record<string, unknown>) ?? {},
    sideEffectGuard: (document.sideEffectGuard as Record<string, unknown>) ?? {},
    startedAt: document.startedAt,
    completedAt: document.completedAt ?? null,
    actorId: document.actorId.toString(),
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export async function createHubSpotMigrationRun(input: {
  workspaceId: string;
  integrationId: string;
  portalId: string;
  destinationProjectId: string;
  destinationReference: string;
  manifestName: string;
  manifestChecksum: string;
  hubspotContactIds: string[];
  mode: HubSpotMigrationRunMode;
  status: HubSpotMigrationRunStatus;
  abortThreshold: number;
  actorId: string;
  sideEffectGuard: Record<string, unknown>;
}): Promise<HubSpotMigrationRunRecord> {
  await connectDb();
  const document = await HubSpotMigrationRunModel.create({
    workspaceId: new mongoose.Types.ObjectId(input.workspaceId),
    integrationId: new mongoose.Types.ObjectId(input.integrationId),
    portalId: input.portalId,
    destinationProjectId: new mongoose.Types.ObjectId(input.destinationProjectId),
    destinationReference: input.destinationReference,
    manifestName: input.manifestName,
    manifestChecksum: input.manifestChecksum,
    hubspotContactIds: input.hubspotContactIds,
    mode: input.mode,
    status: input.status,
    abortThreshold: input.abortThreshold,
    unexpectedCount: 0,
    createdCount: 0,
    skippedCount: 0,
    wouldCreateCount: 0,
    aborted: false,
    abortReason: null,
    records: [],
    reconciliation: {},
    sideEffectGuard: input.sideEffectGuard,
    startedAt: new Date(),
    completedAt: null,
    actorId: new mongoose.Types.ObjectId(input.actorId),
  });
  return toRecord(document.toObject() as HubSpotMigrationRunDocument);
}

export async function updateHubSpotMigrationRun(
  runId: string,
  patch: Partial<{
    status: HubSpotMigrationRunStatus;
    unexpectedCount: number;
    createdCount: number;
    skippedCount: number;
    wouldCreateCount: number;
    aborted: boolean;
    abortReason: string | null;
    records: HubSpotMigrationRunRecordItem[];
    reconciliation: Record<string, unknown>;
    completedAt: Date | null;
  }>,
): Promise<HubSpotMigrationRunRecord | null> {
  await connectDb();
  const document = await HubSpotMigrationRunModel.findByIdAndUpdate(
    runId,
    { $set: patch },
    { new: true },
  ).lean<HubSpotMigrationRunDocument | null>();
  return document ? toRecord(document) : null;
}

export async function findHubSpotMigrationRunById(
  runId: string,
): Promise<HubSpotMigrationRunRecord | null> {
  await connectDb();
  const document = await HubSpotMigrationRunModel.findById(runId).lean<HubSpotMigrationRunDocument | null>();
  return document ? toRecord(document) : null;
}

export async function findActiveExecuteRunByChecksum(
  workspaceId: string,
  manifestChecksum: string,
): Promise<HubSpotMigrationRunRecord | null> {
  await connectDb();
  const document = await HubSpotMigrationRunModel.findOne({
    workspaceId: new mongoose.Types.ObjectId(workspaceId),
    manifestChecksum,
    mode: "execute",
    status: { $in: ["running", "completed"] },
  }).lean<HubSpotMigrationRunDocument | null>();
  return document ? toRecord(document) : null;
}
