import mongoose, { type InferSchemaType, Schema } from "mongoose";

import {
  AD_CONNECTION_STATUSES,
  AD_PLATFORMS,
} from "@/lib/advertising-constants";

const adConnectionSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    platform: { type: String, enum: AD_PLATFORMS, required: true },
    name: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: AD_CONNECTION_STATUSES,
      default: "draft",
      required: true,
    },
    /** Opaque vault ciphertext — never log or return to clients. */
    credentialsEncrypted: { type: String, default: null },
    /** Non-secret external business / org id for routing. */
    externalBusinessId: { type: String, trim: true, default: null },
    grantedScopes: { type: [String], default: [] },
    /** Write scopes must stay empty through Phase 1 read-only pilot. */
    writeScopesEnabled: { type: Boolean, default: false },
    healthMessage: { type: String, trim: true, default: null },
    lastSuccessfulSyncAt: { type: Date, default: null },
    lastSyncAttemptAt: { type: Date, default: null },
    lastSyncError: { type: String, trim: true, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

adConnectionSchema.index({ workspaceId: 1, archivedAt: 1 });
adConnectionSchema.index({ workspaceId: 1, platform: 1, status: 1 });
adConnectionSchema.index(
  { workspaceId: 1, platform: 1, externalBusinessId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      externalBusinessId: { $type: "string", $ne: "" },
      archivedAt: null,
    },
  },
);

export type AdConnectionDocument = InferSchemaType<typeof adConnectionSchema> & {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const AdConnectionModel =
  (mongoose.models.AdConnection as mongoose.Model<AdConnectionDocument>) ??
  mongoose.model<AdConnectionDocument>("AdConnection", adConnectionSchema);

export { AD_CONNECTION_STATUSES };
