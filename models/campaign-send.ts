import mongoose, { type InferSchemaType, Schema } from "mongoose";

const SEND_STATUSES = ["queued", "sent", "failed", "skipped"] as const;

const campaignSendSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    campaignId: { type: Schema.Types.ObjectId, ref: "Campaign", required: true },
    campaignStepId: { type: Schema.Types.ObjectId, ref: "CampaignStep", required: true },
    enrollmentId: { type: Schema.Types.ObjectId, ref: "CampaignEnrollment", required: true },
    leadId: { type: Schema.Types.ObjectId, ref: "Lead", default: null },
    opportunityId: { type: Schema.Types.ObjectId, ref: "Opportunity", default: null },
    status: {
      type: String,
      enum: SEND_STATUSES,
      required: true,
    },
    providerMessageId: { type: String, trim: true, default: null },
    error: { type: String, trim: true, default: null },
    scheduledFor: { type: Date, required: true },
    sentAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

campaignSendSchema.index({ workspaceId: 1 });
campaignSendSchema.index({ workspaceId: 1, campaignId: 1 });
campaignSendSchema.index({ workspaceId: 1, enrollmentId: 1 });
campaignSendSchema.index({ workspaceId: 1, campaignStepId: 1 });
campaignSendSchema.index({ workspaceId: 1, status: 1 });
campaignSendSchema.index({ workspaceId: 1, scheduledFor: 1 });
campaignSendSchema.index({ workspaceId: 1, sentAt: 1 });
campaignSendSchema.index({ providerMessageId: 1 }, { sparse: true });
campaignSendSchema.index(
  { workspaceId: 1, enrollmentId: 1, campaignStepId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "sent" },
  },
);

export type CampaignSendDocument = InferSchemaType<typeof campaignSendSchema> & {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
};

export const CampaignSendModel =
  (mongoose.models.CampaignSend as mongoose.Model<CampaignSendDocument>) ??
  mongoose.model<CampaignSendDocument>("CampaignSend", campaignSendSchema);
