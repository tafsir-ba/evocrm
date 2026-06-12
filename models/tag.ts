import mongoose, { type InferSchemaType, Schema } from "mongoose";

import { TAG_ENTITY_TYPES } from "@/lib/dictionary-constants";

const tagSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    name: { type: String, required: true, trim: true },
    nameNormalized: { type: String, required: true, lowercase: true, trim: true },
    color: { type: String, required: true, trim: true },
    entityTypes: {
      type: [String],
      required: true,
      enum: TAG_ENTITY_TYPES,
      default: [],
    },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

tagSchema.index(
  { workspaceId: 1, nameNormalized: 1 },
  { unique: true, partialFilterExpression: { archivedAt: null } },
);
tagSchema.index({ workspaceId: 1, entityTypes: 1 });
tagSchema.index({ workspaceId: 1, archivedAt: 1 });

export type TagDocument = InferSchemaType<typeof tagSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const TagModel =
  (mongoose.models.Tag as mongoose.Model<TagDocument>) ??
  mongoose.model<TagDocument>("Tag", tagSchema);
