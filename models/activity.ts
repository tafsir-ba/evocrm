import mongoose, { type InferSchemaType, Schema } from "mongoose";

const activitySchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    opportunityId: { type: Schema.Types.ObjectId, ref: "Opportunity", default: null },
    leadId: { type: Schema.Types.ObjectId, ref: "Lead", default: null },
    propertyId: { type: Schema.Types.ObjectId, ref: "Property", default: null },
    typeId: { type: Schema.Types.ObjectId, ref: "DictionaryItem", required: true },
    statusId: { type: Schema.Types.ObjectId, ref: "DictionaryItem", required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    assignedTo: { type: Schema.Types.ObjectId, ref: "User", default: null },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: null },
    dueDate: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    outcome: { type: String, trim: true, default: null },
    nextActionDate: { type: Date, default: null },
    hubspotExternalActivityId: { type: String, trim: true, default: null },
    attributes: { type: Schema.Types.Mixed, default: {} },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

activitySchema.index({ workspaceId: 1 });
activitySchema.index({ workspaceId: 1, projectId: 1 });
activitySchema.index({ workspaceId: 1, projectId: 1, archivedAt: 1 });
activitySchema.index({ workspaceId: 1, createdAt: -1 });
activitySchema.index({ workspaceId: 1, updatedAt: -1 });
activitySchema.index({ workspaceId: 1, archivedAt: 1 });
activitySchema.index({ workspaceId: 1, opportunityId: 1 });
activitySchema.index({ workspaceId: 1, leadId: 1 });
activitySchema.index({ workspaceId: 1, propertyId: 1 });
activitySchema.index({ workspaceId: 1, typeId: 1 });
activitySchema.index({ workspaceId: 1, statusId: 1 });
activitySchema.index({ workspaceId: 1, assignedTo: 1 });
activitySchema.index({ workspaceId: 1, ownerId: 1 });
activitySchema.index({ workspaceId: 1, dueDate: 1 });
activitySchema.index({ workspaceId: 1, completedAt: 1 });
activitySchema.index({ workspaceId: 1, cancelledAt: 1 });
activitySchema.index({ workspaceId: 1, nextActionDate: 1 });
activitySchema.index({ workspaceId: 1, assignedTo: 1, dueDate: 1, archivedAt: 1 });
activitySchema.index({ workspaceId: 1, statusId: 1, dueDate: 1, archivedAt: 1 });
activitySchema.index({ workspaceId: 1, leadId: 1, createdAt: -1 });
activitySchema.index({ workspaceId: 1, propertyId: 1, createdAt: -1 });
activitySchema.index({ workspaceId: 1, opportunityId: 1, createdAt: -1 });
activitySchema.index(
  { workspaceId: 1, hubspotExternalActivityId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      hubspotExternalActivityId: { $type: "string", $gt: "" },
    },
  },
);

export type ActivityDocument = InferSchemaType<typeof activitySchema> & {
  _id: mongoose.Types.ObjectId;
};

export const ActivityModel =
  (mongoose.models.Activity as mongoose.Model<ActivityDocument>) ??
  mongoose.model<ActivityDocument>("Activity", activitySchema);
