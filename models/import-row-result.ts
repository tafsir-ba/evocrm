import mongoose, { type InferSchemaType, Schema } from "mongoose";

const importRowIssueSchema = new Schema(
  {
    rowNumber: { type: Number, required: true },
    field: { type: String, default: null },
    message: { type: String, required: true },
    severity: { type: String, enum: ["error", "warning"], required: true },
  },
  { _id: false },
);

const importRowResultSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    importJobId: { type: Schema.Types.ObjectId, ref: "ImportJob", required: true },
    rowNumber: { type: Number, required: true },
    status: {
      type: String,
      enum: ["valid", "created", "skipped", "failed"],
      required: true,
    },
    entityId: { type: String, default: null },
    errors: { type: [importRowIssueSchema], default: [] },
    warnings: { type: [importRowIssueSchema], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

importRowResultSchema.index({ workspaceId: 1, importJobId: 1, rowNumber: 1 });
importRowResultSchema.index({ importJobId: 1 });

export type ImportRowResultDocument = InferSchemaType<typeof importRowResultSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const ImportRowResultModel =
  (mongoose.models.ImportRowResult as mongoose.Model<ImportRowResultDocument>) ??
  mongoose.model<ImportRowResultDocument>("ImportRowResult", importRowResultSchema);
