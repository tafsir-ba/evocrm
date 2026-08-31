import "server-only";

import mongoose from "mongoose";

import type { HubSpotSyncEventStatus, HubSpotSyncOutcome } from "@/lib/hubspot-ongoing-sync";
import {
  HubSpotSyncEventModel,
  type HubSpotSyncEventDocument,
} from "@/models/hubspot-sync-event";
import { connectDb } from "@/server/db/mongoose";
import { withWorkspaceScope } from "@/server/workspaces/with-workspace-scope";

export type HubSpotSyncEventRecord = {
  id: string;
  workspaceId: string;
  integrationId: string;
  eventKey: string;
  contactId: string;
  subscriptionType: string | null;
  hubspotEventId: string | null;
  occurredAt: Date | null;
  lastModifiedAt: string | null;
  emailHash: string | null;
  status: HubSpotSyncEventStatus;
  outcome: HubSpotSyncOutcome | null;
  parkReason: string | null;
  errorCode: string | null;
  attemptCount: number;
  leadId: string | null;
  payloadSummary: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

function toRecord(document: HubSpotSyncEventDocument): HubSpotSyncEventRecord {
  return {
    id: document._id.toString(),
    workspaceId: document.workspaceId.toString(),
    integrationId: document.integrationId.toString(),
    eventKey: document.eventKey,
    contactId: document.contactId,
    subscriptionType: document.subscriptionType ?? null,
    hubspotEventId: document.hubspotEventId ?? null,
    occurredAt: document.occurredAt ?? null,
    lastModifiedAt: document.lastModifiedAt ?? null,
    emailHash: document.emailHash ?? null,
    status: document.status as HubSpotSyncEventStatus,
    outcome: (document.outcome as HubSpotSyncOutcome | null) ?? null,
    parkReason: document.parkReason ?? null,
    errorCode: document.errorCode ?? null,
    attemptCount: document.attemptCount,
    leadId: document.leadId?.toString() ?? null,
    payloadSummary: (document.payloadSummary as Record<string, unknown>) ?? {},
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: number }).code === 11000
  );
}

export async function findHubSpotSyncEventByKey(
  workspaceId: string,
  integrationId: string,
  eventKey: string,
): Promise<HubSpotSyncEventRecord | null> {
  await connectDb();
  const document = await HubSpotSyncEventModel.findOne(
    withWorkspaceScope(workspaceId, {
      integrationId: new mongoose.Types.ObjectId(integrationId),
      eventKey,
    }),
  ).lean<HubSpotSyncEventDocument | null>();
  return document ? toRecord(document) : null;
}

export async function findLatestHubSpotSyncEventForContact(
  workspaceId: string,
  integrationId: string,
  contactId: string,
): Promise<HubSpotSyncEventRecord | null> {
  await connectDb();
  const document = await HubSpotSyncEventModel.findOne(
    withWorkspaceScope(workspaceId, {
      integrationId: new mongoose.Types.ObjectId(integrationId),
      contactId,
      status: "processed",
    }),
  )
    .sort({ occurredAt: -1, createdAt: -1 })
    .lean<HubSpotSyncEventDocument | null>();
  return document ? toRecord(document) : null;
}

export async function claimHubSpotSyncEvent(input: {
  workspaceId: string;
  integrationId: string;
  eventKey: string;
  contactId: string;
  subscriptionType?: string | null;
  hubspotEventId?: string | null;
  occurredAt?: Date | null;
  lastModifiedAt?: string | null;
  emailHash?: string | null;
  payloadSummary?: Record<string, unknown>;
}): Promise<{ record: HubSpotSyncEventRecord; created: boolean }> {
  await connectDb();
  const existing = await findHubSpotSyncEventByKey(
    input.workspaceId,
    input.integrationId,
    input.eventKey,
  );
  if (existing) {
    return { record: existing, created: false };
  }

  try {
    const document = await HubSpotSyncEventModel.create({
      workspaceId: input.workspaceId,
      integrationId: input.integrationId,
      eventKey: input.eventKey,
      contactId: input.contactId,
      subscriptionType: input.subscriptionType ?? null,
      hubspotEventId: input.hubspotEventId ?? null,
      occurredAt: input.occurredAt ?? null,
      lastModifiedAt: input.lastModifiedAt ?? null,
      emailHash: input.emailHash ?? null,
      status: "received",
      attemptCount: 0,
      payloadSummary: input.payloadSummary ?? {},
    });
    return {
      record: toRecord(document.toObject() as HubSpotSyncEventDocument),
      created: true,
    };
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      const raced = await findHubSpotSyncEventByKey(
        input.workspaceId,
        input.integrationId,
        input.eventKey,
      );
      if (raced) {
        return { record: raced, created: false };
      }
    }
    throw error;
  }
}

export async function updateHubSpotSyncEvent(
  workspaceId: string,
  eventId: string,
  patch: Partial<{
    status: HubSpotSyncEventStatus;
    outcome: HubSpotSyncOutcome | null;
    parkReason: string | null;
    errorCode: string | null;
    attemptCount: number;
    leadId: string | null;
    lastModifiedAt: string | null;
    payloadSummary: Record<string, unknown>;
  }>,
): Promise<HubSpotSyncEventRecord | null> {
  await connectDb();
  const $set: Record<string, unknown> = { ...patch };
  if (patch.leadId) {
    $set.leadId = new mongoose.Types.ObjectId(patch.leadId);
  } else if (patch.leadId === null) {
    $set.leadId = null;
  }
  const document = await HubSpotSyncEventModel.findOneAndUpdate(
    withWorkspaceScope(workspaceId, { _id: eventId }),
    { $set },
    { new: true },
  ).lean<HubSpotSyncEventDocument | null>();
  return document ? toRecord(document) : null;
}

export async function countHubSpotSyncEvents(
  workspaceId: string,
  integrationId?: string,
): Promise<{
  received: number;
  processed: number;
  skipped: number;
  failed: number;
  deadLetter: number;
  parked: number;
}> {
  await connectDb();
  const match: Record<string, unknown> = withWorkspaceScope(workspaceId, {});
  if (integrationId) {
    match.integrationId = new mongoose.Types.ObjectId(integrationId);
  }
  const [statusRows, parkedRows] = await Promise.all([
    HubSpotSyncEventModel.aggregate<{ _id: string; count: number }>([
      { $match: match },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    HubSpotSyncEventModel.countDocuments({ ...match, outcome: "parked" }),
  ]);
  const byStatus = Object.fromEntries(statusRows.map((row) => [row._id, row.count]));
  return {
    received: byStatus.received ?? 0,
    processed: byStatus.processed ?? 0,
    skipped: byStatus.skipped ?? 0,
    failed: byStatus.failed ?? 0,
    deadLetter: byStatus.dead_letter ?? 0,
    parked: parkedRows,
  };
}
