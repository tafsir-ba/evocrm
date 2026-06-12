import mongoose, { type InferSchemaType, Schema } from "mongoose";

const userSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    name: { type: String },
    image: { type: String },
    authProvider: {
      type: String,
      enum: ["google"],
      required: true,
      default: "google",
    },
  },
  { timestamps: true },
);

export type UserDocument = InferSchemaType<typeof userSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const UserModel =
  (mongoose.models.User as mongoose.Model<UserDocument>) ??
  mongoose.model<UserDocument>("User", userSchema);
