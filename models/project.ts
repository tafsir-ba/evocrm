import mongoose, { type InferSchemaType, Schema } from "mongoose";

const PROJECT_TYPES = [
  "development",
  "resale_mandate",
  "rental_project",
  "other",
] as const;

const COMMERCIAL_STAGES = ["planned", "pre_launch", "live", "sold_closed"] as const;
const PROJECT_COMPANY_ROLES = ["developer", "owner", "marketing_sales_partner"] as const;

const projectLocationSchema = new Schema(
  {
    countryCode: { type: String, trim: true, uppercase: true, default: null },
    countryName: { type: String, trim: true, default: null },
    cantonCode: { type: String, trim: true, uppercase: true, default: null },
    cantonName: { type: String, trim: true, default: null },
    municipality: { type: String, trim: true, default: null },
    postalCode: { type: String, trim: true, default: null },
    normalizedAddress: { type: String, trim: true, default: null },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    precision: {
      type: String,
      enum: ["exact_project", "address", "locality", "unknown"],
      default: "unknown",
    },
    sourceUrl: { type: String, trim: true, default: null },
    confidence: { type: String, enum: ["high", "medium", "low"], default: null },
    reviewStatus: {
      type: String,
      enum: ["verified", "review_needed", "unresolved"],
      default: "unresolved",
    },
    provenance: { type: Schema.Types.Mixed, default: null },
  },
  { _id: false },
);

const projectCompanySchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    role: { type: String, enum: PROJECT_COMPANY_ROLES, required: true },
    isPrimary: { type: Boolean, default: false },
  },
  { _id: false },
);

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
    commercialStage: {
      type: String,
      enum: COMMERCIAL_STAGES,
      default: null,
    },
    propertyTypeId: { type: Schema.Types.ObjectId, ref: "DictionaryItem", default: null },
    website: { type: String, trim: true, default: null },
    defaultDripCampaignId: {
      type: Schema.Types.ObjectId,
      ref: "Campaign",
      default: null,
    },
    statusId: { type: Schema.Types.ObjectId, ref: "DictionaryItem", default: null },
    address: { type: String, trim: true, default: null },
    city: { type: String, trim: true, default: null },
    country: { type: String, trim: true, default: null },
    location: { type: projectLocationSchema, default: () => ({}) },
    companies: { type: [projectCompanySchema], default: [] },
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
projectSchema.index({ workspaceId: 1, "location.countryCode": 1 });
projectSchema.index({ workspaceId: 1, "location.cantonCode": 1 });
projectSchema.index({ workspaceId: 1, "location.municipality": 1 });
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
