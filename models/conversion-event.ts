import mongoose, { type InferSchemaType, Schema } from "mongoose";

import {
  ATTRIBUTION_MODELS,
  CONSENT_CAPTURE_CHANNELS,
  CONSENT_PURPOSES,
  CONVERSION_EXPORT_STATUSES,
  CONVERSION_MILESTONES,
} from "@/lib/advertising-constants";

const consentSnapshotSchema = new Schema(
  {
    granted: { type: Boolean, default: false, required: true },
    channel: {
      type: String,
      enum: CONSENT_CAPTURE_CHANNELS,
      default: null,
    },
    purposes: {
      type: [{ type: String, enum: CONSENT_PURPOSES }],
      default: [],
    },
    policyVersion: { type: String, trim: true, default: null },
    capturedAt: { type: Date, default: null },
    market: { type: String, trim: true, default: null },
  },
  { _id: false },
);

/**
 * First-class conversion event — not Lead.attributes.
 * Phase 0 scaffolding; export path lands in Phase 6 (consent-gated).
 */
const conversionEventSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    growthCampaignId: {
      type: Schema.Types.ObjectId,
      ref: "GrowthCampaign",
      default: null,
    },
    leadId: { type: Schema.Types.ObjectId, ref: "Lead", default: null },
    opportunityId: { type: Schema.Types.ObjectId, ref: "Opportunity", default: null },
    touchpointId: {
      type: Schema.Types.ObjectId,
      ref: "AttributionTouchpoint",
      default: null,
    },
    milestone: { type: String, enum: CONVERSION_MILESTONES, required: true },
    value: { type: Number, default: null },
    currency: { type: String, trim: true, uppercase: true, default: null },
    occurredAt: { type: Date, required: true, default: () => new Date() },
    consentSnapshot: {
      type: consentSnapshotSchema,
      default: () => ({ granted: false }),
    },
    exportStatus: {
      type: String,
      enum: CONVERSION_EXPORT_STATUSES,
      default: "not_eligible",
      required: true,
    },
    attributionModel: {
      type: String,
      enum: ATTRIBUTION_MODELS,
      default: "last_touch",
    },
  },
  { timestamps: true },
);

conversionEventSchema.index({ workspaceId: 1, projectId: 1, occurredAt: -1 });
conversionEventSchema.index({ workspaceId: 1, leadId: 1, milestone: 1 });
conversionEventSchema.index({ workspaceId: 1, exportStatus: 1 });

export type ConversionEventDocument = InferSchemaType<typeof conversionEventSchema> & {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const ConversionEventModel =
  (mongoose.models.ConversionEvent as mongoose.Model<ConversionEventDocument>) ??
  mongoose.model<ConversionEventDocument>("ConversionEvent", conversionEventSchema);

export { CONVERSION_MILESTONES, CONVERSION_EXPORT_STATUSES as EXPORT_STATUSES };
