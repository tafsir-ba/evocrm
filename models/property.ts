import mongoose, { type InferSchemaType, Schema } from "mongoose";

const propertySchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", default: null },
    statusId: { type: Schema.Types.ObjectId, ref: "DictionaryItem", required: true },
    typeId: { type: Schema.Types.ObjectId, ref: "DictionaryItem", default: null },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    assignedTo: { type: Schema.Types.ObjectId, ref: "User", default: null },
    title: { type: String, required: true, trim: true },
    reference: { type: String, trim: true, default: null },
    price: { type: Number, default: null },
    currency: { type: String, required: true, trim: true, default: "USD" },
    address: { type: String, trim: true, default: null },
    city: { type: String, trim: true, default: null },
    country: { type: String, trim: true, default: null },
    rooms: { type: Number, default: null },
    bedrooms: { type: Number, default: null },
    bathrooms: { type: Number, default: null },
    surface: { type: Number, default: null },
    surfaceUnit: { type: String, enum: ["sqm", "sqft"], default: "sqm" },
    floor: { type: Number, default: null },
    description: { type: String, trim: true, default: null },
    features: { type: [String], default: [] },
    tags: { type: [{ type: Schema.Types.ObjectId, ref: "Tag" }], default: [] },
    attributes: { type: Schema.Types.Mixed, default: {} },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

propertySchema.index({ workspaceId: 1 });
propertySchema.index({ workspaceId: 1, createdAt: -1 });
propertySchema.index({ workspaceId: 1, updatedAt: -1 });
propertySchema.index({ workspaceId: 1, archivedAt: 1 });
propertySchema.index({ workspaceId: 1, statusId: 1 });
propertySchema.index({ workspaceId: 1, typeId: 1 });
propertySchema.index({ workspaceId: 1, projectId: 1 });
propertySchema.index({ workspaceId: 1, assignedTo: 1 });
propertySchema.index({ workspaceId: 1, ownerId: 1 });
propertySchema.index({ workspaceId: 1, city: 1 });
propertySchema.index({ workspaceId: 1, country: 1 });
propertySchema.index({ workspaceId: 1, tags: 1 });
propertySchema.index(
  { workspaceId: 1, reference: 1 },
  {
    unique: true,
    partialFilterExpression: { reference: { $type: "string", $ne: "" } },
  },
);

export type PropertyDocument = InferSchemaType<typeof propertySchema> & {
  _id: mongoose.Types.ObjectId;
};

export const PropertyModel =
  (mongoose.models.Property as mongoose.Model<PropertyDocument>) ??
  mongoose.model<PropertyDocument>("Property", propertySchema);
