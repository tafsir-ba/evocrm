import mongoose, { type InferSchemaType, Schema } from "mongoose";

export const INTEGRATION_LOG_DIRECTIONS = ["inbound", "outbound"] as const;
export const INTEGRATION_LOG_STATUSES = ["success", "failed"] as const;

const integrationLogSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    integrationId: { type: Schema.Types.ObjectId, ref: "Integration", required: true },
    direction: { type: String, enum: INTEGRATION_LOG_DIRECTIONS, required: true },
    status: { type: String, enum: INTEGRATION_LOG_STATUSES, required: true },
    eventType: { type: String, required: true, trim: true },
    payloadSummary: { type: Schema.Types.Mixed, default: null },
    error: { type: String, trim: true, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

integrationLogSchema.index({ workspaceId: 1 });
integrationLogSchema.index({ workspaceId: 1, integrationId: 1 });
integrationLogSchema.index({ workspaceId: 1, status: 1 });
integrationLogSchema.index({ workspaceId: 1, eventType: 1 });
integrationLogSchema.index({ workspaceId: 1, createdAt: -1 });
integrationLogSchema.index({ integrationId: 1, createdAt: -1 });

export type IntegrationLogDocument = InferSchemaType<typeof integrationLogSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const IntegrationLogModel =
  (mongoose.models.IntegrationLog as mongoose.Model<IntegrationLogDocument>) ??
  mongoose.model<IntegrationLogDocument>("IntegrationLog", integrationLogSchema);
