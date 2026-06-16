import mongoose, { type InferSchemaType, Schema } from "mongoose";

import { DEFAULT_CAMPAIGN_STEP_SEND_TIME } from "@/lib/campaign-defaults";

const CAMPAIGN_STEP_STATUSES = ["draft", "ready", "active", "paused"] as const;
const CAMPAIGN_STEP_CONTENT_MODES = ["rich_text", "plain_text", "html"] as const;
const CAMPAIGN_STEP_DELAY_UNITS = ["days", "hours"] as const;

const campaignStepSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    campaignId: { type: Schema.Types.ObjectId, ref: "Campaign", required: true },
    order: { type: Number, required: true, min: 1 },
    name: { type: String, trim: true, default: null },
    delayDays: { type: Number, required: true, min: 0 },
    delayAmount: { type: Number, min: 0, default: null },
    delayUnit: { type: String, enum: CAMPAIGN_STEP_DELAY_UNITS, default: "days" },
    sendTime: { type: String, required: true, trim: true, default: DEFAULT_CAMPAIGN_STEP_SEND_TIME },
    fromName: { type: String, trim: true, default: null },
    channel: { type: String, enum: ["email"], default: "email" },
    status: { type: String, enum: CAMPAIGN_STEP_STATUSES, default: "draft" },
    contentMode: {
      type: String,
      enum: CAMPAIGN_STEP_CONTENT_MODES,
      default: "plain_text",
    },
    subject: { type: String, trim: true, default: "" },
    previewText: { type: String, trim: true, default: null },
    body: { type: String, trim: true, default: "" },
    bodyHtml: { type: String, default: null },
    bodyText: { type: String, default: null },
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
