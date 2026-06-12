import mongoose, { type InferSchemaType, Schema } from "mongoose";

const workspaceSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    type: { type: String, required: true, default: "agency" },
    timezone: { type: String, required: true, default: "UTC" },
    defaultCurrency: { type: String, required: true, default: "USD" },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
  },
  { timestamps: true },
);

export type WorkspaceDocument = InferSchemaType<typeof workspaceSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const WorkspaceModel =
  (mongoose.models.Workspace as mongoose.Model<WorkspaceDocument>) ??
  mongoose.model<WorkspaceDocument>("Workspace", workspaceSchema);
