import mongoose, { type InferSchemaType, Schema } from "mongoose";

import { AD_PLATFORMS } from "@/lib/advertising-constants";
import { ADVERTISING_CAMPAIGN_STATUSES } from "@/lib/advertising-hierarchy-constants";

const adSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    adAccountId: { type: Schema.Types.ObjectId, ref: "AdAccount", required: true },
    advertisingCampaignId: {
      type: Schema.Types.ObjectId,
      ref: "AdvertisingCampaign",
      required: true,
    },
    adGroupId: { type: Schema.Types.ObjectId, ref: "AdGroup", required: true },
    platform: { type: String, enum: AD_PLATFORMS, required: true },
    externalAdId: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ADVERTISING_CAMPAIGN_STATUSES,
      default: "unknown",
      required: true,
    },
    observedState: { type: Schema.Types.Mixed, default: null },
    lastSuccessfulSyncAt: { type: Date, default: null },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

adSchema.index({ workspaceId: 1, adGroupId: 1 });
adSchema.index(
  { workspaceId: 1, platform: 1, externalAdId: 1 },
  { unique: true, partialFilterExpression: { archivedAt: null } },
);

export type AdDocument = InferSchemaType<typeof adSchema> & {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const AdModel =
  (mongoose.models.Ad as mongoose.Model<AdDocument>) ??
  mongoose.model<AdDocument>("Ad", adSchema);
