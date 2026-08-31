import mongoose, { type InferSchemaType, Schema } from "mongoose";

import {
  HUBSPOT_SYNC_EVENT_STATUSES,
  HUBSPOT_SYNC_OUTCOMES,
} from "@/lib/hubspot-ongoing-sync";

const hubspotSyncEventSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    integrationId: { type: Schema.Types.ObjectId, ref: "Integration", required: true },
    eventKey: { type: String, required: true, trim: true },
    contactId: { type: String, required: true, trim: true },
    subscriptionType: { type: String, trim: true, default: null },
    hubspotEventId: { type: String, trim: true, default: null },
    occurredAt: { type: Date, default: null },
    lastModifiedAt: { type: String, trim: true, default: null },
    emailHash: { type: String, trim: true, default: null },
    status: {
      type: String,
      enum: HUBSPOT_SYNC_EVENT_STATUSES,
      required: true,
      default: "received",
    },
    outcome: {
      type: String,
      enum: HUBSPOT_SYNC_OUTCOMES,
      default: undefined,
    },
    parkReason: { type: String, trim: true, default: null },
    errorCode: { type: String, trim: true, default: null },
    attemptCount: { type: Number, required: true, default: 0 },
    leadId: { type: Schema.Types.ObjectId, ref: "Lead", default: null },
    payloadSummary: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

hubspotSyncEventSchema.index(
  { workspaceId: 1, integrationId: 1, eventKey: 1 },
  { unique: true },
);
hubspotSyncEventSchema.index({ workspaceId: 1, integrationId: 1, contactId: 1, createdAt: -1 });
hubspotSyncEventSchema.index({ workspaceId: 1, status: 1, createdAt: -1 });
hubspotSyncEventSchema.index({ workspaceId: 1, outcome: 1, createdAt: -1 });

export type HubSpotSyncEventDocument = InferSchemaType<typeof hubspotSyncEventSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const HubSpotSyncEventModel =
  (mongoose.models.HubSpotSyncEvent as mongoose.Model<HubSpotSyncEventDocument>) ??
  mongoose.model<HubSpotSyncEventDocument>("HubSpotSyncEvent", hubspotSyncEventSchema);
