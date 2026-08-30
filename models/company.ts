import mongoose, { type InferSchemaType, Schema } from "mongoose";

const companySchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    name: { type: String, required: true, trim: true },
    nameNormalized: { type: String, required: true, trim: true, lowercase: true },
    website: { type: String, trim: true, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

companySchema.index(
  { workspaceId: 1, nameNormalized: 1 },
  { unique: true, partialFilterExpression: { archivedAt: null } },
);
companySchema.index({ workspaceId: 1, archivedAt: 1 });

export type CompanyDocument = InferSchemaType<typeof companySchema> & {
  _id: mongoose.Types.ObjectId;
};

export const CompanyModel =
  (mongoose.models.Company as mongoose.Model<CompanyDocument>) ??
  mongoose.model<CompanyDocument>("Company", companySchema);
