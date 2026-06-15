import mongoose, { type InferSchemaType, Schema } from "mongoose";

import { DEFAULT_CAMPAIGN_STEP_SEND_TIME } from "@/lib/campaign-defaults";

const campaignStepSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    campaignId: { type: Schema.Types.ObjectId, ref: "Campaign", required: true },
    order: { type: Number, required: true, min: 1 },
    delayDays: { type: Number, required: true, min: 0 },
    sendTime: { type: String, required: true, trim: true, default: DEFAULT_CAMPAIGN_STEP_SEND_TIME },
    fromName: { type: String, required: true, trim: true },
    channel: { type: String, enum: ["email"], default: "email" },
    subject: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    documentIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "Document" }],
      default: [],
    },
  },
  { timestamps: true },
);

campaignStepSchema.index({ workspaceId: 1 });
campaignStepSchema.index({ workspaceId: 1, campaignId: 1 });
campaignStepSchema.index(
  { workspaceId: 1, campaignId: 1, order: 1 },
  { unique: true },
);

export type CampaignStepDocument = InferSchemaType<typeof campaignStepSchema> & {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const CampaignStepModel =
  (mongoose.models.CampaignStep as mongoose.Model<CampaignStepDocument>) ??
  mongoose.model<CampaignStepDocument>("CampaignStep", campaignStepSchema);
