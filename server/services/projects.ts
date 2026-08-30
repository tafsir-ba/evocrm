import "server-only";

import { createAuditLog } from "@/server/audit/create-audit-log";
import { AppError } from "@/server/errors";
import {
  archiveProject,
  createProject,
  findProjectById,
  findProjectByReference,
  findProjects,
  findProjectsPage,
  updateProject,
  type ProjectListFilter,
  type ProjectListItem,
  type ProjectRecord,
} from "@/server/repositories/projects";
import { validateOptionalAssignableMember } from "@/server/services/assignments";
import type { CreateProjectInput, UpdateProjectInput } from "@/server/validation/projects";
import {
  emptyProjectLocation,
  normalizeProjectLocation,
  type ProjectLocation,
} from "@/lib/project-location";

function projectSnapshot(project: ProjectRecord): Record<string, unknown> {
  return {
    name: project.name,
    reference: project.reference,
    projectType: project.projectType,
    defaultDripCampaignId: project.defaultDripCampaignId,
    statusId: project.statusId,
    address: project.address,
    city: project.city,
    country: project.country,
    location: project.location,
    description: project.description,
    ownerId: project.ownerId,
    assignedTo: project.assignedTo,
  };
}

function locationFromManualInput(
  input: NonNullable<CreateProjectInput["location"]>,
  existing?: ProjectLocation | null,
): ProjectLocation {
  return normalizeProjectLocation({
    ...existing,
    ...input,
    provenance: {
      method: "manual",
      catalogKey: existing?.provenance?.catalogKey ?? null,
      appliedAt: new Date().toISOString(),
      previousManual: existing?.provenance?.previousManual ?? null,
      notes: "Manual location update.",
    },
  });
}

export async function listProjectsForWorkspace(
  workspaceId: string,
  filter: ProjectListFilter = {},
): Promise<ProjectListItem[]> {
  return findProjects(workspaceId, filter);
}

export async function listProjectsPageForWorkspace(
  workspaceId: string,
  filter: ProjectListFilter = {},
): Promise<{ projects: ProjectListItem[]; total: number }> {
  return findProjectsPage(workspaceId, filter);
}

export async function getProjectForWorkspace(
  workspaceId: string,
  projectId: string,
): Promise<ProjectRecord> {
  const project = await findProjectById(workspaceId, projectId);

  if (!project) {
    throw new AppError("NOT_FOUND", "Project not found.");
  }

  return project;
}

export async function createProjectForWorkspace(
  workspaceId: string,
  actorId: string,
  input: CreateProjectInput,
): Promise<ProjectRecord> {
  await validateOptionalAssignableMember(workspaceId, input.ownerId, "Owner");
  await validateOptionalAssignableMember(workspaceId, input.assignedTo, "Assigned to");

  if (input.reference) {
    const duplicate = await findProjectByReference(workspaceId, input.reference);

    if (duplicate) {
      throw new AppError("CONFLICT", "A project with this reference already exists.");
    }
  }

  const project = await createProject({
    workspaceId,
    createdBy: actorId,
    name: input.name,
    reference: input.reference ?? null,
    projectType: input.projectType ?? null,
    defaultDripCampaignId: input.defaultDripCampaignId ?? null,
    statusId: input.statusId ?? null,
    address: input.address ?? null,
    city: input.city ?? null,
    country: input.country ?? null,
    location: input.location
      ? locationFromManualInput(input.location)
      : emptyProjectLocation(),
    description: input.description ?? null,
    ownerId: input.ownerId ?? null,
    assignedTo: input.assignedTo ?? null,
  });

  await createAuditLog({
    workspaceId,
    actorId,
    action: "project.created",
    entityType: "project",
    entityId: project.id,
    after: projectSnapshot(project),
  });

  return project;
}

export async function updateProjectForWorkspace(
  workspaceId: string,
  projectId: string,
  actorId: string,
  input: UpdateProjectInput,
): Promise<ProjectRecord> {
  const existing = await findProjectById(workspaceId, projectId);

  if (!existing || existing.archivedAt) {
    throw new AppError("NOT_FOUND", "Project not found.");
  }

  if (input.ownerId !== undefined) {
    await validateOptionalAssignableMember(workspaceId, input.ownerId, "Owner");
  }
  if (input.assignedTo !== undefined) {
    await validateOptionalAssignableMember(
      workspaceId,
      input.assignedTo,
      "Assigned to",
    );
  }

  if (input.reference) {
    const duplicate = await findProjectByReference(workspaceId, input.reference);

    if (duplicate && duplicate.id !== projectId) {
      throw new AppError("CONFLICT", "A project with this reference already exists.");
    }
  }

  const updatePayload: Parameters<typeof updateProject>[2] = {};

  if (input.name !== undefined) {
    updatePayload.name = input.name.trim();
  }
  if (input.reference !== undefined) {
    updatePayload.reference = input.reference?.trim() || null;
  }
  if (input.projectType !== undefined) {
    updatePayload.projectType = input.projectType;
  }
  if (input.defaultDripCampaignId !== undefined) {
    updatePayload.defaultDripCampaignId = input.defaultDripCampaignId;
  }
  if (input.statusId !== undefined) {
    updatePayload.statusId = input.statusId;
  }
  if (input.address !== undefined) {
    updatePayload.address = input.address?.trim() || null;
  }
  if (input.city !== undefined) {
    updatePayload.city = input.city?.trim() || null;
  }
  if (input.country !== undefined) {
    updatePayload.country = input.country?.trim() || null;
  }
  if (input.location !== undefined) {
    updatePayload.location = input.location
      ? locationFromManualInput(input.location, existing.location)
      : emptyProjectLocation();
  }
  if (input.description !== undefined) {
    updatePayload.description = input.description?.trim() || null;
  }
  if (input.ownerId !== undefined) {
    updatePayload.ownerId = input.ownerId;
  }
  if (input.assignedTo !== undefined) {
    updatePayload.assignedTo = input.assignedTo;
  }

  const updated = await updateProject(workspaceId, projectId, updatePayload);

  if (!updated) {
    throw new AppError("NOT_FOUND", "Project not found.");
  }

  await createAuditLog({
    workspaceId,
    actorId,
    action: "project.updated",
    entityType: "project",
    entityId: projectId,
    before: projectSnapshot(existing),
    after: projectSnapshot(updated),
  });

  return updated;
}

export async function archiveProjectForWorkspace(
  workspaceId: string,
  projectId: string,
  actorId: string,
): Promise<ProjectRecord> {
  const existing = await findProjectById(workspaceId, projectId);

  if (!existing || existing.archivedAt) {
    throw new AppError("NOT_FOUND", "Project not found.");
  }

  const archived = await archiveProject(workspaceId, projectId);

  if (!archived) {
    throw new AppError("NOT_FOUND", "Project not found.");
  }

  await createAuditLog({
    workspaceId,
    actorId,
    action: "project.archived",
    entityType: "project",
    entityId: projectId,
    before: { archivedAt: null },
    after: { archivedAt: archived.archivedAt },
  });

  return archived;
}
