import mongoose, { type InferSchemaType, Schema } from "mongoose";

import { AD_PLATFORMS } from "@/lib/advertising-constants";
import { ADVERTISING_CAMPAIGN_STATUSES } from "@/lib/advertising-hierarchy-constants";

/**
 * Platform paid-media campaign (Meta campaign / Google campaign).
 * Not the email-drip Campaign model. Not the GrowthCampaign umbrella.
 */
const advertisingCampaignSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    adAccountId: { type: Schema.Types.ObjectId, ref: "AdAccount", required: true },
    growthCampaignId: {
      type: Schema.Types.ObjectId,
      ref: "GrowthCampaign",
      default: null,
    },
    platform: { type: String, enum: AD_PLATFORMS, required: true },
    externalCampaignId: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ADVERTISING_CAMPAIGN_STATUSES,
      default: "unknown",
      required: true,
    },
    objective: { type: String, trim: true, default: null },
    observedState: { type: Schema.Types.Mixed, default: null },
    lastSuccessfulSyncAt: { type: Date, default: null },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

advertisingCampaignSchema.index({ workspaceId: 1, adAccountId: 1 });
advertisingCampaignSchema.index({ workspaceId: 1, growthCampaignId: 1 });
advertisingCampaignSchema.index(
  { workspaceId: 1, platform: 1, externalCampaignId: 1 },
  { unique: true, partialFilterExpression: { archivedAt: null } },
);

export type AdvertisingCampaignDocument = InferSchemaType<
  typeof advertisingCampaignSchema
> & {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const AdvertisingCampaignModel =
  (mongoose.models.AdvertisingCampaign as mongoose.Model<AdvertisingCampaignDocument>) ??
  mongoose.model<AdvertisingCampaignDocument>(
    "AdvertisingCampaign",
    advertisingCampaignSchema,
  );
