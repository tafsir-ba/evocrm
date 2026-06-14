import "server-only";

import mongoose from "mongoose";

import { connectDb } from "@/server/db/mongoose";
import { AppError } from "@/server/errors";
import { UserModel, type AuthProvider, type UserDocument } from "@/models/user";

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: number }).code === 11000
  );
}

export type UserRecord = {
  id: string;
  email: string;
  name?: string;
  image?: string;
  authProvider: AuthProvider;
  createdAt: Date;
  updatedAt: Date;
};

type UserDocumentWithPassword = UserDocument & {
  passwordHash?: string;
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
  if (!mongoose.isValidObjectId(userId)) {
    return null;
  }

  await connectDb();
  const document = await UserModel.findById(userId).lean<UserDocument>();
  return document ? toUserRecord(document) : null;
}

export async function findUserWithPasswordByEmail(
  email: string,
): Promise<(UserRecord & { passwordHash?: string }) | null> {
  await connectDb();
  const normalizedEmail = email.toLowerCase().trim();
  const document = await UserModel.findOne({ email: normalizedEmail })
    .select("+passwordHash")
    .lean<UserDocumentWithPassword>();

  if (!document) {
    return null;
  }

  return {
    ...toUserRecord(document),
    passwordHash: document.passwordHash ?? undefined,
  };
}

export async function createCredentialsUser(input: {
  email: string;
  name: string;
  passwordHash: string;
}): Promise<UserRecord> {
  await connectDb();
  const email = input.email.toLowerCase().trim();

  try {
    const document = await UserModel.create({
      email,
      name: input.name,
      authProvider: "credentials",
      passwordHash: input.passwordHash,
    });

    return toUserRecord(document.toObject() as UserDocument);
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new AppError("CONFLICT", "An account with this email already exists.");
    }

    throw error;
  }
}

export async function linkCredentialsToUser(input: {
  email: string;
  name?: string;
  passwordHash: string;
}): Promise<UserRecord> {
  await connectDb();
  const email = input.email.toLowerCase().trim();

  const document = await UserModel.findOneAndUpdate(
    { email },
    {
      $set: {
        passwordHash: input.passwordHash,
        ...(input.name ? { name: input.name } : {}),
      },
    },
    { new: true, runValidators: true },
  ).lean<UserDocument>();

  if (!document) {
    throw new AppError("NOT_FOUND", "User not found.");
  }

  return toUserRecord(document);
}

export async function upsertUserFromProvider(input: {
  email: string;
  name?: string | null;
  image?: string | null;
}): Promise<UserRecord> {
  await connectDb();
  const email = input.email.toLowerCase().trim();
  const existing = await UserModel.findOne({ email }).lean<UserDocument>();

  if (existing) {
    const document = await UserModel.findOneAndUpdate(
      { email },
      {
        $set: {
          ...(input.name ? { name: input.name } : {}),
          ...(input.image ? { image: input.image } : {}),
        },
      },
      { new: true, runValidators: true },
    ).lean<UserDocument>();

    if (!document) {
      throw new AppError("NOT_FOUND", "User not found.");
    }

    return toUserRecord(document);
  }

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
