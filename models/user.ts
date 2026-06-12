import mongoose, { type InferSchemaType, Schema } from "mongoose";

const authProviders = ["google", "credentials"] as const;

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
      enum: authProviders,
      required: true,
    },
    passwordHash: {
      type: String,
      select: false,
    },
    emailVerifiedAt: { type: Date },
  },
  { timestamps: true },
);

export type UserDocument = InferSchemaType<typeof userSchema> & {
  _id: mongoose.Types.ObjectId;
};

export type AuthProvider = (typeof authProviders)[number];

export const UserModel =
  (mongoose.models.User as mongoose.Model<UserDocument>) ??
  mongoose.model<UserDocument>("User", userSchema);
