import mongoose, { type InferSchemaType, Schema } from "mongoose";

const opportunitySchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    leadId: { type: Schema.Types.ObjectId, ref: "Lead", required: true },
    propertyId: { type: Schema.Types.ObjectId, ref: "Property", required: true },
    statusId: { type: Schema.Types.ObjectId, ref: "DictionaryItem", required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    assignedTo: { type: Schema.Types.ObjectId, ref: "User", default: null },
    value: { type: Number, min: 0, default: null },
    currency: { type: String, required: true, trim: true },
    probability: { type: Number, min: 0, max: 100, default: null },
    expectedCloseDate: { type: Date, default: null },
    lostReasonId: { type: Schema.Types.ObjectId, ref: "DictionaryItem", default: null },
    lostReasonText: { type: String, trim: true, default: null },
    closedAt: { type: Date, default: null },
    wonAt: { type: Date, default: null },
    lostAt: { type: Date, default: null },
    notes: { type: String, trim: true, default: null },
    tags: { type: [{ type: Schema.Types.ObjectId, ref: "Tag" }], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

opportunitySchema.index({ workspaceId: 1 });
opportunitySchema.index({ workspaceId: 1, projectId: 1 });
opportunitySchema.index({ workspaceId: 1, projectId: 1, archivedAt: 1 });
opportunitySchema.index({ workspaceId: 1, createdAt: -1 });
opportunitySchema.index({ workspaceId: 1, updatedAt: -1 });
opportunitySchema.index({ workspaceId: 1, archivedAt: 1 });
opportunitySchema.index({ workspaceId: 1, leadId: 1 });
opportunitySchema.index({ workspaceId: 1, propertyId: 1 });
opportunitySchema.index({ workspaceId: 1, statusId: 1 });
opportunitySchema.index({ workspaceId: 1, assignedTo: 1 });
opportunitySchema.index({ workspaceId: 1, ownerId: 1 });
opportunitySchema.index({ workspaceId: 1, expectedCloseDate: 1 });
opportunitySchema.index({ workspaceId: 1, closedAt: 1 });
opportunitySchema.index({ workspaceId: 1, wonAt: 1 });
opportunitySchema.index({ workspaceId: 1, lostAt: 1 });
opportunitySchema.index({ workspaceId: 1, tags: 1 });
opportunitySchema.index({ workspaceId: 1, statusId: 1, archivedAt: 1 });
opportunitySchema.index({ workspaceId: 1, leadId: 1, archivedAt: 1 });
opportunitySchema.index({ workspaceId: 1, propertyId: 1, archivedAt: 1 });
opportunitySchema.index({ workspaceId: 1, assignedTo: 1, statusId: 1 });

export type OpportunityDocument = InferSchemaType<typeof opportunitySchema> & {
  _id: mongoose.Types.ObjectId;
};

export const OpportunityModel =
  (mongoose.models.Opportunity as mongoose.Model<OpportunityDocument>) ??
  mongoose.model<OpportunityDocument>("Opportunity", opportunitySchema);
