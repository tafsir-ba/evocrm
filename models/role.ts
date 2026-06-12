import mongoose, { type InferSchemaType, Schema } from "mongoose";

const roleSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    name: { type: String, required: true, trim: true },
    key: { type: String, required: true, lowercase: true, trim: true },
    permissions: { type: [String], required: true, default: [] },
    isSystem: { type: Boolean, required: true, default: false },
  },
  { timestamps: true },
);

roleSchema.index({ workspaceId: 1, key: 1 }, { unique: true });

export type RoleDocument = InferSchemaType<typeof roleSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const RoleModel =
  (mongoose.models.Role as mongoose.Model<RoleDocument>) ??
  mongoose.model<RoleDocument>("Role", roleSchema);
