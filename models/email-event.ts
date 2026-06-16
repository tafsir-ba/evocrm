import mongoose, { type InferSchemaType, Schema } from "mongoose";

const EMAIL_EVENT_TYPES = [
  "delivered",
  "bounced",
  "complained",
  "opened",
  "clicked",
  "delivery_delayed",
  "failed",
  "sent",
] as const;

const emailEventSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    campaignId: { type: Schema.Types.ObjectId, ref: "Campaign", default: null },
    campaignStepId: { type: Schema.Types.ObjectId, ref: "CampaignStep", default: null },
    contactId: { type: Schema.Types.ObjectId, default: null },
    emailSendId: { type: Schema.Types.ObjectId, ref: "CampaignSend", default: null },
    provider: { type: String, enum: ["resend"], default: "resend" },
    providerEventId: { type: String, trim: true, default: null },
    providerEmailId: { type: String, trim: true, default: null },
    eventType: { type: String, enum: EMAIL_EVENT_TYPES, required: true },
    eventTimestamp: { type: Date, required: true },
    rawPayload: { type: Schema.Types.Mixed, default: null },
    metadata: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

emailEventSchema.index({ workspaceId: 1, createdAt: -1 });
emailEventSchema.index({ workspaceId: 1, campaignId: 1 });
emailEventSchema.index({ workspaceId: 1, emailSendId: 1 });
emailEventSchema.index({ providerEmailId: 1 });
emailEventSchema.index({ providerEventId: 1 }, { sparse: true });

export type EmailEventDocument = InferSchemaType<typeof emailEventSchema> & {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const EmailEventModel =
  (mongoose.models.EmailEvent as mongoose.Model<EmailEventDocument>) ??
  mongoose.model<EmailEventDocument>("EmailEvent", emailEventSchema);
