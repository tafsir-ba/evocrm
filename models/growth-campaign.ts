import mongoose, { type InferSchemaType, Schema } from "mongoose";

import { GROWTH_CAMPAIGN_STATUSES } from "@/lib/advertising-constants";

const trustedDestinationSchema = new Schema(
  {
    destinationKey: { type: String, required: true, trim: true },
    label: { type: String, trim: true, default: null },
    websiteIntegrationId: {
      type: Schema.Types.ObjectId,
      ref: "Integration",
      default: null,
    },
    /** Always true — browser cannot retarget project. */
    projectLocked: { type: Boolean, default: true, required: true },
  },
  { _id: true },
);

const budgetEnvelopeSchema = new Schema(
  {
    currency: { type: String, trim: true, uppercase: true, default: null },
    totalCap: { type: Number, default: null },
    dailyCap: { type: Number, default: null },
  },
  { _id: false },
);

const growthCampaignSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    /** Required — exactly one CRM Project. Browser cannot override. */
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    name: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: GROWTH_CAMPAIGN_STATUSES,
      default: "draft",
      required: true,
    },
    objective: { type: String, trim: true, default: null },
    marketCountryCode: { type: String, trim: true, uppercase: true, default: null },
    budgetEnvelope: { type: budgetEnvelopeSchema, default: () => ({}) },
    outcomeTarget: { type: String, trim: true, default: null },
    linkedDripCampaignId: {
      type: Schema.Types.ObjectId,
      ref: "Campaign",
      default: null,
    },
    attributionKey: { type: String, trim: true, default: null },
    trustedDestinations: { type: [trustedDestinationSchema], default: [] },
    /** v1 reporting default from brief — labelled at read time. */
    attributionPolicy: {
      type: String,
      enum: ["last_touch", "first_touch", "weighted"],
      default: "last_touch",
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

growthCampaignSchema.index({ workspaceId: 1, archivedAt: 1 });
growthCampaignSchema.index({ workspaceId: 1, projectId: 1, status: 1 });
growthCampaignSchema.index({ workspaceId: 1, attributionKey: 1 });

export type GrowthCampaignDocument = InferSchemaType<typeof growthCampaignSchema> & {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const GrowthCampaignModel =
  (mongoose.models.GrowthCampaign as mongoose.Model<GrowthCampaignDocument>) ??
  mongoose.model<GrowthCampaignDocument>("GrowthCampaign", growthCampaignSchema);

export { GROWTH_CAMPAIGN_STATUSES };
