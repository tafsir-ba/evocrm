import "server-only";

import { findActiveMembershipsForWorkspace } from "@/server/repositories/memberships";
import { findUsersByIds } from "@/server/repositories/users";

export type WorkspaceMemberSummary = {
  userId: string;
  name: string | null;
  email: string;
};

export async function listWorkspaceMembersForWorkspace(
  workspaceId: string,
): Promise<WorkspaceMemberSummary[]> {
  const memberships = await findActiveMembershipsForWorkspace(workspaceId);
  const users = await findUsersByIds(
    memberships.map((membership) => membership.userId),
  );
  const usersById = new Map(users.map((user) => [user.id, user]));
  const members: WorkspaceMemberSummary[] = [];

  for (const membership of memberships) {
    const user = usersById.get(membership.userId);
    if (!user) {
      continue;
    }

    members.push({
      userId: user.id,
      name: user.name ?? null,
      email: user.email,
    });
  }

  return members.sort((left, right) =>
    (left.name ?? left.email).localeCompare(right.name ?? right.email),
  );
}
