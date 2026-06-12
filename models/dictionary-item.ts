import mongoose, { type InferSchemaType, Schema } from "mongoose";

import { DICTIONARY_TYPES } from "@/lib/dictionary-constants";

const dictionaryItemSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    dictionaryId: { type: Schema.Types.ObjectId, ref: "Dictionary", required: true },
    type: { type: String, required: true, enum: DICTIONARY_TYPES },
    label: { type: String, required: true, trim: true },
    key: { type: String, required: true, lowercase: true, trim: true },
    color: { type: String, required: true, trim: true },
    order: { type: Number, required: true, default: 0 },
    isDefault: { type: Boolean, required: true, default: false },
    isActive: { type: Boolean, required: true, default: true },
    isSystem: { type: Boolean, required: true, default: false },
    behavior: { type: String },
    defaultProbability: { type: Number, min: 0, max: 100 },
  },
  { timestamps: true },
);

dictionaryItemSchema.index({ workspaceId: 1, type: 1, key: 1 }, { unique: true });
dictionaryItemSchema.index({ workspaceId: 1, dictionaryId: 1 });
dictionaryItemSchema.index({ workspaceId: 1, type: 1, isActive: 1, order: 1 });

export type DictionaryItemDocument = InferSchemaType<typeof dictionaryItemSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const DictionaryItemModel =
  (mongoose.models.DictionaryItem as mongoose.Model<DictionaryItemDocument>) ??
  mongoose.model<DictionaryItemDocument>("DictionaryItem", dictionaryItemSchema);
