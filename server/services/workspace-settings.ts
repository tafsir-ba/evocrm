import "server-only";

import { createAuditLog } from "@/server/audit/create-audit-log";
import { AppError } from "@/server/errors";
import {
  findWorkspaceById,
  updateWorkspace,
  type WorkspaceRecord,
} from "@/server/repositories/workspaces";
import type { UpdateWorkspaceSettingsInput } from "@/server/validation/workspace-settings";

export type WorkspaceSettingsView = {
  id: string;
  name: string;
  slug: string;
  type: string;
  timezone: string;
  defaultCurrency: string;
  createdAt: string;
  updatedAt: string;
};

function toSettingsView(workspace: WorkspaceRecord): WorkspaceSettingsView {
  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    type: workspace.type,
    timezone: workspace.timezone,
    defaultCurrency: workspace.defaultCurrency,
    createdAt: workspace.createdAt.toISOString(),
    updatedAt: workspace.updatedAt.toISOString(),
  };
}

export async function getWorkspaceSettings(
  workspaceId: string,
): Promise<WorkspaceSettingsView> {
  const workspace = await findWorkspaceById(workspaceId);

  if (!workspace) {
    throw new AppError("NOT_FOUND", "Workspace not found.");
  }

  return toSettingsView(workspace);
}

export async function updateWorkspaceSettings(input: {
  workspaceId: string;
  actorId: string;
  data: UpdateWorkspaceSettingsInput;
}): Promise<WorkspaceSettingsView> {
  const existing = await findWorkspaceById(input.workspaceId);

  if (!existing) {
    throw new AppError("NOT_FOUND", "Workspace not found.");
  }

  const updated = await updateWorkspace(input.workspaceId, input.data);

  await createAuditLog({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: "workspace.updated",
    entityType: "workspace",
    entityId: input.workspaceId,
    before: {
      name: existing.name,
      type: existing.type,
      timezone: existing.timezone,
      defaultCurrency: existing.defaultCurrency,
    },
    after: {
      name: updated.name,
      type: updated.type,
      timezone: updated.timezone,
      defaultCurrency: updated.defaultCurrency,
    },
  });

  return toSettingsView(updated);
}
