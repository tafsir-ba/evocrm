import mongoose, { type InferSchemaType, Schema } from "mongoose";

const CAMPAIGN_STATUSES = ["draft", "active", "paused", "archived"] as const;
const CAMPAIGN_AUDIENCE_TYPES = ["leads", "opportunities"] as const;

const campaignSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    name: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: CAMPAIGN_STATUSES,
      default: "draft",
    },
    audienceType: {
      type: String,
      enum: CAMPAIGN_AUDIENCE_TYPES,
      required: true,
    },
    frequency: { type: String, trim: true, default: null },
    defaultFromName: { type: String, trim: true, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

campaignSchema.index({ workspaceId: 1 });
campaignSchema.index({ workspaceId: 1, status: 1 });
campaignSchema.index({ workspaceId: 1, audienceType: 1 });
campaignSchema.index({ workspaceId: 1, createdAt: -1 });
campaignSchema.index({ workspaceId: 1, archivedAt: 1 });
campaignSchema.index({ workspaceId: 1, ownerId: 1 });

export type CampaignDocument = InferSchemaType<typeof campaignSchema> & {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const CampaignModel =
  (mongoose.models.Campaign as mongoose.Model<CampaignDocument>) ??
  mongoose.model<CampaignDocument>("Campaign", campaignSchema);
