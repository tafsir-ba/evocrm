import "server-only";

import { findActiveMembershipsForWorkspace } from "@/server/repositories/memberships";
import { findUserById } from "@/server/repositories/users";

export type WorkspaceMemberSummary = {
  userId: string;
  name: string | null;
  email: string;
};

export async function listWorkspaceMembersForWorkspace(
  workspaceId: string,
): Promise<WorkspaceMemberSummary[]> {
  const memberships = await findActiveMembershipsForWorkspace(workspaceId);
  const members: WorkspaceMemberSummary[] = [];

  for (const membership of memberships) {
    const user = await findUserById(membership.userId);

    if (user) {
      members.push({
        userId: user.id,
        name: user.name ?? null,
        email: user.email,
      });
    }
  }

  return members.sort((left, right) =>
    (left.name ?? left.email).localeCompare(right.name ?? right.email),
  );
}
