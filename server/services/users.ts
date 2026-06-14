import "server-only";

import {
  upsertUserFromProvider,
  type UserRecord,
} from "@/server/repositories/users";

export async function syncUserFromProviderProfile(input: {
  email: string;
  name?: string | null;
  image?: string | null;
}): Promise<UserRecord> {
  return upsertUserFromProvider(input);
}
