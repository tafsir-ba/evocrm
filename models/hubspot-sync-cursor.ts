import mongoose, { type InferSchemaType, Schema } from "mongoose";

import {
  HUBSPOT_SYNC_CURSOR_STATUSES,
  HUBSPOT_ONGOING_SYNC_SIDE_EFFECT_GUARD,
} from "@/lib/hubspot-ongoing-sync";

const hubspotSyncCursorSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    integrationId: { type: Schema.Types.ObjectId, ref: "Integration", required: true },
    portalId: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: HUBSPOT_SYNC_CURSOR_STATUSES,
      required: true,
      default: "pending_cutover",
    },
    cutoverAt: { type: Date, default: null },
    lastReconciledModifiedAt: { type: Date, default: null },
    lastReconciledAfter: { type: String, trim: true, default: null },
    lastReconciledContactId: { type: String, trim: true, default: null },
    lastWebhookOccurredAt: { type: Date, default: null },
    dryRunVerifiedAt: { type: Date, default: null },
    dryRunSummary: { type: Schema.Types.Mixed, default: {} },
    baselineContactCount: { type: Number, default: null },
    notesStatus: {
      type: String,
      enum: HUBSPOT_SYNC_CURSOR_STATUSES,
      default: "pending_cutover",
    },
    notesDryRunVerifiedAt: { type: Date, default: null },
    notesDryRunSummary: { type: Schema.Types.Mixed, default: {} },
    lastNotesReconciledModifiedAt: { type: Date, default: null },
    lastNotesReconciledAfter: { type: String, trim: true, default: null },
    lastNotesReconciledContactId: { type: String, trim: true, default: null },
    sideEffectGuard: {
      type: Schema.Types.Mixed,
      required: true,
      default: () => ({ ...HUBSPOT_ONGOING_SYNC_SIDE_EFFECT_GUARD }),
    },
  },
  { timestamps: true },
);

hubspotSyncCursorSchema.index({ workspaceId: 1, integrationId: 1 }, { unique: true });
hubspotSyncCursorSchema.index({ workspaceId: 1, status: 1 });
hubspotSyncCursorSchema.index({ portalId: 1 });

export type HubSpotSyncCursorDocument = InferSchemaType<typeof hubspotSyncCursorSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const HubSpotSyncCursorModel =
  (mongoose.models.HubSpotSyncCursor as mongoose.Model<HubSpotSyncCursorDocument>) ??
  mongoose.model<HubSpotSyncCursorDocument>("HubSpotSyncCursor", hubspotSyncCursorSchema);
