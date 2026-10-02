import mongoose, { type InferSchemaType, Schema } from "mongoose";

import {
  AD_PLATFORMS,
  CONSENT_CAPTURE_CHANNELS,
  CONSENT_PURPOSES,
} from "@/lib/advertising-constants";

/**
 * First-class paid touchpoint — not Lead.attributes.
 * Phase 0 scaffolding; capture pipeline lands in Phase 2.
 */
const consentStateSchema = new Schema(
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

const attributionTouchpointSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    growthCampaignId: {
      type: Schema.Types.ObjectId,
      ref: "GrowthCampaign",
      default: null,
    },
    leadId: { type: Schema.Types.ObjectId, ref: "Lead", default: null },
    platform: { type: String, enum: AD_PLATFORMS, default: null },
    adAccountId: { type: Schema.Types.ObjectId, ref: "AdAccount", default: null },
    externalCampaignId: { type: String, trim: true, default: null },
    externalAdGroupId: { type: String, trim: true, default: null },
    externalAdId: { type: String, trim: true, default: null },
    utmSource: { type: String, trim: true, default: null },
    utmMedium: { type: String, trim: true, default: null },
    utmCampaign: { type: String, trim: true, default: null },
    utmContent: { type: String, trim: true, default: null },
    utmTerm: { type: String, trim: true, default: null },
    clickId: { type: String, trim: true, default: null },
    landingPage: { type: String, trim: true, default: null },
    consent: { type: consentStateSchema, default: () => ({ granted: false }) },
    capturedAt: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: true },
);

attributionTouchpointSchema.index({ workspaceId: 1, leadId: 1, capturedAt: -1 });
attributionTouchpointSchema.index({ workspaceId: 1, projectId: 1, capturedAt: -1 });
attributionTouchpointSchema.index({ workspaceId: 1, growthCampaignId: 1 });
attributionTouchpointSchema.index({ workspaceId: 1, clickId: 1 });

export type AttributionTouchpointDocument = InferSchemaType<
  typeof attributionTouchpointSchema
> & {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const AttributionTouchpointModel =
  (mongoose.models.AttributionTouchpoint as mongoose.Model<AttributionTouchpointDocument>) ??
  mongoose.model<AttributionTouchpointDocument>(
    "AttributionTouchpoint",
    attributionTouchpointSchema,
  );
