import mongoose, { type InferSchemaType, Schema } from "mongoose";

const auditLogSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    action: { type: String, required: true, trim: true },
    entityType: { type: String, required: true, trim: true },
    entityId: { type: String, required: true, trim: true },
    before: { type: Schema.Types.Mixed, default: null },
    after: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditLogSchema.index({ workspaceId: 1 });
auditLogSchema.index({ workspaceId: 1, createdAt: -1 });
auditLogSchema.index({ workspaceId: 1, entityType: 1, entityId: 1 });
auditLogSchema.index({ workspaceId: 1, action: 1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });

export type AuditLogDocument = InferSchemaType<typeof auditLogSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const AuditLogModel =
  (mongoose.models.AuditLog as mongoose.Model<AuditLogDocument>) ??
  mongoose.model<AuditLogDocument>("AuditLog", auditLogSchema);
