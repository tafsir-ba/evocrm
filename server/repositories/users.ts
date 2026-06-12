import "server-only";

import { connectDb } from "@/server/db/mongoose";
import { UserModel, type UserDocument } from "@/models/user";

export type UserRecord = {
  id: string;
  email: string;
  name?: string;
  image?: string;
  authProvider: "google";
  createdAt: Date;
  updatedAt: Date;
};

function toUserRecord(document: UserDocument): UserRecord {
  return {
    id: document._id.toString(),
    email: document.email,
    name: document.name ?? undefined,
    image: document.image ?? undefined,
    authProvider: document.authProvider,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  await connectDb();
  const normalizedEmail = email.toLowerCase().trim();
  const document = await UserModel.findOne({ email: normalizedEmail }).lean<UserDocument>();
  return document ? toUserRecord(document) : null;
}

export async function findUserById(userId: string): Promise<UserRecord | null> {
  await connectDb();
  const document = await UserModel.findById(userId).lean<UserDocument>();
  return document ? toUserRecord(document) : null;
}

export async function upsertUserFromProvider(input: {
  email: string;
  name?: string | null;
  image?: string | null;
}): Promise<UserRecord> {
  await connectDb();
  const email = input.email.toLowerCase().trim();

  const document = await UserModel.findOneAndUpdate(
    { email },
    {
      $set: {
        name: input.name ?? undefined,
        image: input.image ?? undefined,
        authProvider: "google",
      },
      $setOnInsert: {
        email,
      },
    },
    { upsert: true, new: true, runValidators: true },
  ).lean<UserDocument>();

  return toUserRecord(document);
}
