import mongoose, { type InferSchemaType, Schema } from "mongoose";

import { DICTIONARY_TYPES } from "@/lib/dictionary-constants";

const dictionarySchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    type: { type: String, required: true, enum: DICTIONARY_TYPES },
    name: { type: String, required: true, trim: true },
    isSystem: { type: Boolean, required: true, default: true },
  },
  { timestamps: true },
);

dictionarySchema.index({ workspaceId: 1, type: 1 }, { unique: true });

export type DictionaryDocument = InferSchemaType<typeof dictionarySchema> & {
  _id: mongoose.Types.ObjectId;
};

export const DictionaryModel =
  (mongoose.models.Dictionary as mongoose.Model<DictionaryDocument>) ??
  mongoose.model<DictionaryDocument>("Dictionary", dictionarySchema);
