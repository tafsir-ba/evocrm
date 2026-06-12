import "server-only";

/**
 * Permission types — full implementation in Phase 2+.
 */

export type MembershipStatus = "active" | "invited" | "removed";

export type WorkspaceMembership = {
  id: string;
  workspaceId: string;
  userId: string;
  roleId: string;
  status: MembershipStatus;
  permissions: string[];
};
