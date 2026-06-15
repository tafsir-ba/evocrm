import mongoose, { type InferSchemaType, Schema } from "mongoose";

const PROJECT_TYPES = [
  "development",
  "resale_mandate",
  "rental_project",
  "other",
] as const;

const projectSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    name: { type: String, required: true, trim: true },
    reference: { type: String, trim: true, default: null },
    projectType: {
      type: String,
      enum: PROJECT_TYPES,
      default: null,
    },
    defaultDripCampaignId: {
      type: Schema.Types.ObjectId,
      ref: "Campaign",
      default: null,
    },
    statusId: { type: Schema.Types.ObjectId, ref: "DictionaryItem", default: null },
    address: { type: String, trim: true, default: null },
    city: { type: String, trim: true, default: null },
    country: { type: String, trim: true, default: null },
    description: { type: String, trim: true, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    assignedTo: { type: Schema.Types.ObjectId, ref: "User", default: null },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

projectSchema.index({ workspaceId: 1 });
projectSchema.index({ workspaceId: 1, archivedAt: 1 });
projectSchema.index({ workspaceId: 1, createdAt: -1 });
projectSchema.index({ workspaceId: 1, assignedTo: 1 });
projectSchema.index(
  { workspaceId: 1, reference: 1 },
  {
    unique: true,
    partialFilterExpression: { reference: { $type: "string", $ne: "" } },
  },
);

export type ProjectDocument = InferSchemaType<typeof projectSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const ProjectModel =
  (mongoose.models.Project as mongoose.Model<ProjectDocument>) ??
  mongoose.model<ProjectDocument>("Project", projectSchema);
