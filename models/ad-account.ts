import mongoose, { type InferSchemaType, Schema } from "mongoose";

import { AD_ACCOUNT_STATUSES, AD_PLATFORMS } from "@/lib/advertising-constants";

const adAccountSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    connectionId: { type: Schema.Types.ObjectId, ref: "AdConnection", required: true },
    platform: { type: String, enum: AD_PLATFORMS, required: true },
    externalAccountId: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    currency: { type: String, required: true, trim: true, uppercase: true },
    timezone: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: AD_ACCOUNT_STATUSES,
      default: "unknown",
      required: true,
    },
    accountLimits: { type: Schema.Types.Mixed, default: null },
    lastSuccessfulSyncAt: { type: Date, default: null },
    lastSyncAttemptAt: { type: Date, default: null },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

adAccountSchema.index({ workspaceId: 1, archivedAt: 1 });
adAccountSchema.index({ workspaceId: 1, connectionId: 1 });
adAccountSchema.index(
  { workspaceId: 1, platform: 1, externalAccountId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      archivedAt: null,
    },
  },
);

export type AdAccountDocument = InferSchemaType<typeof adAccountSchema> & {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const AdAccountModel =
  (mongoose.models.AdAccount as mongoose.Model<AdAccountDocument>) ??
  mongoose.model<AdAccountDocument>("AdAccount", adAccountSchema);

export { AD_ACCOUNT_STATUSES };
