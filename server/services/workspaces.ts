import "server-only";

import { z } from "zod";

import { createAuditLog } from "@/server/audit/create-audit-log";
import { AppError } from "@/server/errors";
import {
  buildPermissionAwareNavigation,
  type WorkspaceNavigationItem,
} from "@/lib/v1-navigation";
import { workspaceNavPath } from "@/lib/workspace-paths";
import { findRoleById } from "@/server/repositories/roles";
import {
  createWorkspace,
  findWorkspaceBySlug,
  slugExists,
  type WorkspaceRecord,
} from "@/server/repositories/workspaces";
import { findActiveMembershipsForUser } from "@/server/repositories/memberships";
import { appendSlugSuffix, slugifyName } from "@/server/workspaces/slug";
import { createOwnerMembership } from "@/server/services/memberships";
import {
  findOwnerRole,
  seedDefaultRolesForWorkspace,
} from "@/server/services/roles";

export const createWorkspaceInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  type: z.string().trim().min(1).max(64).default("agency"),
  timezone: z.string().trim().min(1).max(64).default("UTC"),
  defaultCurrency: z.string().trim().min(3).max(3).default("USD"),
});

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceInputSchema>;

export type WorkspaceListItem = {
  id: string;
  name: string;
  slug: string;
  type: string;
  timezone: string;
  defaultCurrency: string;
};

export type WorkspaceContext = {
  workspace: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
    defaultCurrency: string;
  };
  membership: {
    status: "active";
    role: {
      name: string;
      key: string;
      permissions: string[];
    };
  };
  navigation: WorkspaceNavigationItem[];
};

export async function generateUniqueWorkspaceSlug(name: string): Promise<string> {
  const baseSlug = slugifyName(name);
  let candidate = baseSlug;
  let suffix = 2;

  while (await slugExists(candidate)) {
    candidate = appendSlugSuffix(baseSlug, suffix);
    suffix += 1;
  }

  return candidate;
}

export async function createWorkspaceForUser(
  userId: string,
  input: CreateWorkspaceInput,
): Promise<WorkspaceRecord> {
  const slug = await generateUniqueWorkspaceSlug(input.name);

  const workspace = await createWorkspace({
    name: input.name,
    slug,
    type: input.type,
    timezone: input.timezone,
    defaultCurrency: input.defaultCurrency.toUpperCase(),
    createdBy: userId,
  });

  const roles = await seedDefaultRolesForWorkspace(workspace.id, userId);
  const ownerRole = roles.find((role) => role.key === "owner");

  if (!ownerRole) {
    throw new AppError("INTERNAL_ERROR", "Owner role was not created.", {
      expose: false,
    });
  }

  await createOwnerMembership({
    userId,
    workspaceId: workspace.id,
    roleId: ownerRole.id,
  });

  await createAuditLog({
    workspaceId: workspace.id,
    actorId: userId,
    action: "workspace.created",
    entityType: "workspace",
    entityId: workspace.id,
    after: {
      name: workspace.name,
      slug: workspace.slug,
      type: workspace.type,
    },
  });

  return workspace;
}

export async function listActiveWorkspacesForUser(
  userId: string,
): Promise<WorkspaceListItem[]> {
  const memberships = await findActiveMembershipsForUser(userId);
  const workspaces: WorkspaceListItem[] = [];

  for (const membership of memberships) {
    const { findWorkspaceById } = await import("@/server/repositories/workspaces");
    const workspace = await findWorkspaceById(membership.workspaceId);

    if (workspace) {
      workspaces.push({
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        type: workspace.type,
        timezone: workspace.timezone,
        defaultCurrency: workspace.defaultCurrency,
      });
    }
  }

  return workspaces.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getWorkspaceContext(
  userId: string,
  workspaceSlug: string,
): Promise<WorkspaceContext> {
  const workspace = await findWorkspaceBySlug(workspaceSlug);

  if (!workspace) {
    throw new AppError("WORKSPACE_NOT_FOUND", "Workspace not found.");
  }

  const { requireMembership } = await import("@/server/permissions/require-membership");
  const membership = await requireMembership(workspace.id, userId);
  const role = await findRoleById(membership.roleId);

  if (!role) {
    throw new AppError("INTERNAL_ERROR", "Membership role not found.", {
      expose: false,
    });
  }

  const navigation = buildPermissionAwareNavigation(
    workspace.slug,
    role.permissions,
  );

  return {
    workspace: {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      timezone: workspace.timezone,
      defaultCurrency: workspace.defaultCurrency,
    },
    membership: {
      status: "active",
      role: {
        name: role.name,
        key: role.key,
        permissions: role.permissions,
      },
    },
    navigation,
  };
}

export function getWorkspaceInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "WS";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
}

export async function resolveFirstWorkspaceSlugForUser(
  userId: string,
): Promise<string | null> {
  const workspaces = await listActiveWorkspacesForUser(userId);
  return workspaces[0]?.slug ?? null;
}

export async function ensureWorkspaceSlugPath(
  workspaceSlug: string,
  segment: string,
): Promise<string> {
  return workspaceNavPath(workspaceSlug, segment);
}

export async function getOwnerRoleForWorkspace(workspaceId: string) {
  return findOwnerRole(workspaceId);
}
