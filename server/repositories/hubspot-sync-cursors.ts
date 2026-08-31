import "server-only";

import mongoose from "mongoose";

import {
  HUBSPOT_ONGOING_SYNC_SIDE_EFFECT_GUARD,
  type HubSpotSyncCursorStatus,
} from "@/lib/hubspot-ongoing-sync";
import {
  HubSpotSyncCursorModel,
  type HubSpotSyncCursorDocument,
} from "@/models/hubspot-sync-cursor";
import { connectDb } from "@/server/db/mongoose";
import { withWorkspaceScope } from "@/server/workspaces/with-workspace-scope";

export type HubSpotSyncCursorRecord = {
  id: string;
  workspaceId: string;
  integrationId: string;
  portalId: string;
  status: HubSpotSyncCursorStatus;
  cutoverAt: Date | null;
  lastReconciledModifiedAt: Date | null;
  lastReconciledAfter: string | null;
  lastReconciledContactId: string | null;
  lastWebhookOccurredAt: Date | null;
  dryRunVerifiedAt: Date | null;
  dryRunSummary: Record<string, unknown>;
  baselineContactCount: number | null;
  sideEffectGuard: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

function toRecord(document: HubSpotSyncCursorDocument): HubSpotSyncCursorRecord {
  return {
    id: document._id.toString(),
    workspaceId: document.workspaceId.toString(),
    integrationId: document.integrationId.toString(),
    portalId: document.portalId,
    status: document.status as HubSpotSyncCursorStatus,
    cutoverAt: document.cutoverAt ?? null,
    lastReconciledModifiedAt: document.lastReconciledModifiedAt ?? null,
    lastReconciledAfter: document.lastReconciledAfter ?? null,
    lastReconciledContactId: document.lastReconciledContactId ?? null,
    lastWebhookOccurredAt: document.lastWebhookOccurredAt ?? null,
    dryRunVerifiedAt: document.dryRunVerifiedAt ?? null,
    dryRunSummary: (document.dryRunSummary as Record<string, unknown>) ?? {},
    baselineContactCount: document.baselineContactCount ?? null,
    sideEffectGuard:
      (document.sideEffectGuard as Record<string, unknown>) ??
      { ...HUBSPOT_ONGOING_SYNC_SIDE_EFFECT_GUARD },
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export async function findHubSpotSyncCursor(
  workspaceId: string,
  integrationId: string,
): Promise<HubSpotSyncCursorRecord | null> {
  await connectDb();
  const document = await HubSpotSyncCursorModel.findOne(
    withWorkspaceScope(workspaceId, {
      integrationId: new mongoose.Types.ObjectId(integrationId),
    }),
  ).lean<HubSpotSyncCursorDocument | null>();
  return document ? toRecord(document) : null;
}

export async function ensureHubSpotSyncCursor(input: {
  workspaceId: string;
  integrationId: string;
  portalId: string;
}): Promise<HubSpotSyncCursorRecord> {
  await connectDb();
  const existing = await findHubSpotSyncCursor(input.workspaceId, input.integrationId);
  if (existing) {
    return existing;
  }

  const document = await HubSpotSyncCursorModel.create({
    workspaceId: input.workspaceId,
    integrationId: input.integrationId,
    portalId: input.portalId,
    status: "pending_cutover",
    sideEffectGuard: { ...HUBSPOT_ONGOING_SYNC_SIDE_EFFECT_GUARD },
  });
  return toRecord(document.toObject() as HubSpotSyncCursorDocument);
}

export async function updateHubSpotSyncCursor(
  workspaceId: string,
  integrationId: string,
  patch: Partial<{
    status: HubSpotSyncCursorStatus;
    cutoverAt: Date | null;
    lastReconciledModifiedAt: Date | null;
    lastReconciledAfter: string | null;
    lastReconciledContactId: string | null;
    lastWebhookOccurredAt: Date | null;
    dryRunVerifiedAt: Date | null;
    dryRunSummary: Record<string, unknown>;
    baselineContactCount: number | null;
  }>,
): Promise<HubSpotSyncCursorRecord | null> {
  await connectDb();
  const document = await HubSpotSyncCursorModel.findOneAndUpdate(
    withWorkspaceScope(workspaceId, {
      integrationId: new mongoose.Types.ObjectId(integrationId),
    }),
    { $set: patch },
    { new: true },
  ).lean<HubSpotSyncCursorDocument | null>();
  return document ? toRecord(document) : null;
}

export async function countHubSpotSyncCursorsByStatus(
  workspaceId: string,
): Promise<Record<string, number>> {
  await connectDb();
  const rows = await HubSpotSyncCursorModel.aggregate<{ _id: string; count: number }>([
    { $match: withWorkspaceScope(workspaceId, {}) },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  return Object.fromEntries(rows.map((row) => [row._id, row.count]));
}
