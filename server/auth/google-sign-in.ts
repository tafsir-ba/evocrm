import "server-only";

import { findUserByEmail } from "@/server/repositories/users";
import { syncUserFromProviderProfile } from "@/server/services/users";

export async function resolveGoogleSignInUserId(input: {
  email: string;
  name?: string | null;
  image?: string | null;
}): Promise<string> {
  const email = input.email.toLowerCase().trim();

  try {
    const record = await syncUserFromProviderProfile({
      email,
      name: input.name,
      image: input.image,
    });
    return record.id;
  } catch (error) {
    console.error("[auth] Google profile sync failed, attempting email lookup:", error);
    const existing = await findUserByEmail(email);

    if (existing) {
      return existing.id;
    }

    throw error;
  }
}
