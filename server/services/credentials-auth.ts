import "server-only";

import bcrypt from "bcryptjs";

import { AppError } from "@/server/errors";
import {
  createCredentialsUser,
  findUserWithPasswordByEmail,
  linkCredentialsToUser,
  type UserRecord,
} from "@/server/repositories/users";
import type { SignupInput } from "@/server/validation/auth";

const BCRYPT_SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export async function registerCredentialsUser(
  input: SignupInput,
): Promise<UserRecord> {
  const email = input.email.toLowerCase().trim();
  const existing = await findUserWithPasswordByEmail(email);

  if (existing?.passwordHash) {
    throw new AppError(
      "CONFLICT",
      "An account with this email already exists. Sign in instead.",
    );
  }

  const passwordHash = await hashPassword(input.password);

  if (existing) {
    return linkCredentialsToUser({
      email,
      name: input.name.trim(),
      passwordHash,
    });
  }

  return createCredentialsUser({
    email,
    name: input.name.trim(),
    passwordHash,
  });
}

export async function verifyCredentialsLogin(input: {
  email: string;
  password: string;
}): Promise<UserRecord | null> {
  const email = input.email.toLowerCase().trim();
  const user = await findUserWithPasswordByEmail(email);

  if (!user?.passwordHash) {
    return null;
  }

  const isValid = await verifyPassword(input.password, user.passwordHash);

  if (!isValid) {
    return null;
  }

  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}
