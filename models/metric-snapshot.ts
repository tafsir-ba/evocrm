import mongoose, { type InferSchemaType, Schema } from "mongoose";

import { AD_PLATFORMS } from "@/lib/advertising-constants";
import { ADVERTISING_ENTITY_KINDS } from "@/lib/advertising-hierarchy-constants";

/**
 * Immutable dated platform delivery facts.
 * Must not overwrite campaign configuration records.
 */
const metricSnapshotSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    platform: { type: String, enum: AD_PLATFORMS, required: true },
    adAccountId: { type: Schema.Types.ObjectId, ref: "AdAccount", required: true },
    entityKind: { type: String, enum: ADVERTISING_ENTITY_KINDS, required: true },
    entityId: { type: Schema.Types.ObjectId, required: true },
    externalEntityId: { type: String, required: true, trim: true },
    /** Account-timezone calendar date YYYY-MM-DD */
    date: { type: String, required: true, trim: true },
    metrics: {
      spend: { type: Number, default: 0 },
      impressions: { type: Number, default: 0 },
      reach: { type: Number, default: 0 },
      clicks: { type: Number, default: 0 },
      cpc: { type: Number, default: null },
      cpm: { type: Number, default: null },
      ctr: { type: Number, default: null },
    },
    /** Success-metric hierarchy tier this row is most useful for (media = 5). */
    metricTier: { type: Number, default: 5, min: 1, max: 5 },
    capturedAt: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

metricSnapshotSchema.index(
  {
    workspaceId: 1,
    platform: 1,
    entityKind: 1,
    externalEntityId: 1,
    date: 1,
  },
  { unique: true },
);
metricSnapshotSchema.index({ workspaceId: 1, adAccountId: 1, date: -1 });
metricSnapshotSchema.index({ workspaceId: 1, entityId: 1, date: -1 });

export type MetricSnapshotDocument = InferSchemaType<typeof metricSnapshotSchema> & {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
};

export const MetricSnapshotModel =
  (mongoose.models.MetricSnapshot as mongoose.Model<MetricSnapshotDocument>) ??
  mongoose.model<MetricSnapshotDocument>("MetricSnapshot", metricSnapshotSchema);
