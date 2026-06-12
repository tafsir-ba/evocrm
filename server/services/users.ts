import "server-only";

import { createAuditLog } from "@/server/audit/create-audit-log";
import {
  upsertUserFromProvider,
  type UserRecord,
} from "@/server/repositories/users";

export async function syncUserFromProviderProfile(input: {
  email: string;
  name?: string | null;
  image?: string | null;
}): Promise<UserRecord> {
  const user = await upsertUserFromProvider(input);

  await createAuditLog({
    workspaceId: "system",
    actorId: user.id,
    action: "auth.user_synced",
    entityType: "workspace",
    entityId: user.id,
    after: { email: user.email },
  });

  return user;
}
