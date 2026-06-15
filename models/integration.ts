import mongoose, { type InferSchemaType, Schema } from "mongoose";

export const INTEGRATION_TYPES = ["mls", "website", "google_ads", "meta_ads"] as const;
export const INTEGRATION_STATUSES = ["active", "paused", "archived", "error"] as const;

const integrationSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    type: { type: String, enum: INTEGRATION_TYPES, required: true },
    name: { type: String, required: true, trim: true },
    status: { type: String, enum: INTEGRATION_STATUSES, required: true },
    credentialsEncrypted: { type: String, default: null },
    apiKeyHash: { type: String, default: null },
    defaultProjectId: { type: Schema.Types.ObjectId, ref: "Project", default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

integrationSchema.index({ workspaceId: 1 });
integrationSchema.index({ workspaceId: 1, type: 1 });
integrationSchema.index({ workspaceId: 1, status: 1 });
integrationSchema.index({ workspaceId: 1, archivedAt: 1 });
integrationSchema.index({ workspaceId: 1, createdAt: -1 });
integrationSchema.index({ workspaceId: 1, apiKeyHash: 1 });
integrationSchema.index(
  { apiKeyHash: 1 },
  {
    unique: true,
    partialFilterExpression: {
      apiKeyHash: { $type: "string", $ne: "" },
    },
  },
);

export type IntegrationDocument = InferSchemaType<typeof integrationSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const IntegrationModel =
  (mongoose.models.Integration as mongoose.Model<IntegrationDocument>) ??
  mongoose.model<IntegrationDocument>("Integration", integrationSchema);
