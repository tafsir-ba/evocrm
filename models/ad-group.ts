import mongoose, { type InferSchemaType, Schema } from "mongoose";

import { AD_PLATFORMS } from "@/lib/advertising-constants";
import { ADVERTISING_CAMPAIGN_STATUSES } from "@/lib/advertising-hierarchy-constants";

const adGroupSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    adAccountId: { type: Schema.Types.ObjectId, ref: "AdAccount", required: true },
    advertisingCampaignId: {
      type: Schema.Types.ObjectId,
      ref: "AdvertisingCampaign",
      required: true,
    },
    platform: { type: String, enum: AD_PLATFORMS, required: true },
    externalAdGroupId: { type: String, required: true, trim: true },
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

adGroupSchema.index({ workspaceId: 1, advertisingCampaignId: 1 });
adGroupSchema.index(
  { workspaceId: 1, platform: 1, externalAdGroupId: 1 },
  { unique: true, partialFilterExpression: { archivedAt: null } },
);

export type AdGroupDocument = InferSchemaType<typeof adGroupSchema> & {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const AdGroupModel =
  (mongoose.models.AdGroup as mongoose.Model<AdGroupDocument>) ??
  mongoose.model<AdGroupDocument>("AdGroup", adGroupSchema);
