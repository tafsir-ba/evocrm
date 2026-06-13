import mongoose, { type InferSchemaType, Schema } from "mongoose";

const documentSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    linkedEntityType: {
      type: String,
      enum: ["lead", "property", "opportunity", "campaign"],
      required: true,
    },
    linkedEntityId: { type: Schema.Types.ObjectId, required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    fileName: { type: String, required: true, trim: true },
    mimeType: { type: String, required: true, trim: true },
    fileSize: { type: Number, required: true, min: 1 },
    bucket: { type: String, required: true, trim: true },
    storageKey: { type: String, required: true, trim: true },
    visibility: { type: String, enum: ["private", "workspace"], default: "private" },
    status: { type: String, enum: ["active", "archived", "failed"], default: "active" },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

documentSchema.index({ workspaceId: 1 });
documentSchema.index({ workspaceId: 1, createdAt: -1 });
documentSchema.index({ workspaceId: 1, archivedAt: 1 });
documentSchema.index({ workspaceId: 1, status: 1 });
documentSchema.index({ workspaceId: 1, uploadedBy: 1 });
documentSchema.index({ workspaceId: 1, linkedEntityType: 1, linkedEntityId: 1 });
documentSchema.index({ workspaceId: 1, storageKey: 1 }, { unique: true });

export type DocumentDocument = InferSchemaType<typeof documentSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const DocumentModel =
  (mongoose.models.Document as mongoose.Model<DocumentDocument>) ??
  mongoose.model<DocumentDocument>("Document", documentSchema);
