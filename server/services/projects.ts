import "server-only";

import {
  emptyProjectLocation,
  normalizeProjectLocation,
  type ProjectLocation,
} from "@/lib/project-location";
import {
  hasPrimaryBusinessCompany,
  PRIMARY_COMPANY_REQUIRED_MESSAGE,
  normalizeProjectCompanies,
  primaryDeveloperCompanyId,
  type ProjectCompanyRole,
} from "@/lib/project-operating-record";
import { createAuditLog } from "@/server/audit/create-audit-log";
import { AppError } from "@/server/errors";
import { findCompaniesByIds } from "@/server/repositories/companies";
import { findLeads, findLeadsByCompanyIds } from "@/server/repositories/leads";
import { findDictionaryItemById } from "@/server/repositories/dictionary-items";
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

export type CreateProjectOptions = {
  /** System/migration callers only. Standard API creates always require a primary company. */
  allowWithoutPrimaryCompany?: boolean;
};

export type ProjectCompanyPerson = {
  id: string;
  companyId: string | null;
  projectId: string | null;
  fullName: string;
  email: string | null;
};

export type ProjectDetailRecord = ProjectRecord & {
  companyPeople: ProjectCompanyPerson[];
  associablePeople: ProjectCompanyPerson[];
};

function projectSnapshot(project: ProjectRecord): Record<string, unknown> {
  return {
    name: project.name,
    reference: project.reference,
    projectType: project.projectType,
    commercialStage: project.commercialStage,
    propertyTypeId: project.propertyTypeId,
    website: project.website,
    defaultDripCampaignId: project.defaultDripCampaignId,
    statusId: project.statusId,
    address: project.address,
    city: project.city,
    country: project.country,
    location: project.location,
    companies: project.companies,
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

function legacyFieldsFromLocation(location: ProjectLocation | null | undefined): {
  address: string | null;
  city: string | null;
  country: string | null;
} {
  if (!location) {
    return { address: null, city: null, country: null };
  }

  return {
    address: location.normalizedAddress,
    city: location.municipality,
    country: location.countryName,
  };
}

async function validateProjectCompanies(
  workspaceId: string,
  companies: Array<{ companyId: string }>,
): Promise<void> {
  const ids = [...new Set(companies.map((item) => item.companyId))];
  if (ids.length === 0) {
    return;
  }

  const found = await findCompaniesByIds(workspaceId, ids);
  if (found.length !== ids.length) {
    throw new AppError("VALIDATION_ERROR", "One or more companies were not found.");
  }
}

async function validatePropertyTypeId(
  workspaceId: string,
  propertyTypeId: string | null | undefined,
): Promise<void> {
  if (!propertyTypeId) {
    return;
  }

  const item = await findDictionaryItemById(workspaceId, propertyTypeId);
  if (!item || item.type !== "property_type" || !item.isActive) {
    throw new AppError("VALIDATION_ERROR", "Property type is invalid.");
  }
}

function requirePrimaryBusinessCompany(
  companies: Array<{ companyId: string; role: ProjectCompanyRole; isPrimary: boolean }>,
): void {
  if (!hasPrimaryBusinessCompany(companies)) {
    throw new AppError("VALIDATION_ERROR", PRIMARY_COMPANY_REQUIRED_MESSAGE);
  }
}

async function withCompanyNames(
  workspaceId: string,
  project: ProjectRecord,
): Promise<ProjectRecord> {
  return (await withCompanyNamesForProjects(workspaceId, [project]))[0]!;
}

async function withCompanyNamesForProjects<T extends ProjectRecord>(
  workspaceId: string,
  projects: T[],
): Promise<T[]> {
  const ids = [
    ...new Set(projects.flatMap((project) => project.companies.map((item) => item.companyId))),
  ];
  if (ids.length === 0) {
    return projects;
  }

  const found = await findCompaniesByIds(workspaceId, ids);
  const byId = new Map(found.map((company) => [company.id, company]));

  return projects.map((project) => ({
    ...project,
    companies: project.companies.map((link) => {
      const company = byId.get(link.companyId);
      return {
        ...link,
        company: company ? { id: company.id, name: company.name } : null,
      };
    }),
  }));
}

function toCompanyPerson(lead: {
  id: string;
  companyId?: string | null;
  projectId: string | null;
  fullName: string;
  email: string | null;
}): ProjectCompanyPerson {
  return {
    id: lead.id,
    companyId: lead.companyId ?? null,
    projectId: lead.projectId,
    fullName: lead.fullName,
    email: lead.email,
  };
}

async function withCompanyPeople(
  workspaceId: string,
  project: ProjectRecord,
): Promise<ProjectDetailRecord> {
  const companyIds = project.companies.map((item) => item.companyId);
  const primaryCompanyId = primaryDeveloperCompanyId(project.companies);

  const [companyLeads, projectLeads] = await Promise.all([
    findLeadsByCompanyIds(workspaceId, companyIds, { limit: 50 }),
    findLeads(workspaceId, { projectId: project.id, page: 1, pageSize: 50 }),
  ]);

  const associatedIds = new Set(companyLeads.map((lead) => lead.id));
  const associablePeople = projectLeads.leads
    .filter((lead) => !associatedIds.has(lead.id) && (lead.companyId ?? null) !== primaryCompanyId)
    .map(toCompanyPerson);

  return {
    ...project,
    companyPeople: companyLeads.map(toCompanyPerson),
    associablePeople,
  };
}

export async function listProjectsForWorkspace(
  workspaceId: string,
  filter: ProjectListFilter = {},
): Promise<ProjectListItem[]> {
  return withCompanyNamesForProjects(workspaceId, await findProjects(workspaceId, filter));
}

export async function listProjectsPageForWorkspace(
  workspaceId: string,
  filter: ProjectListFilter = {},
): Promise<{ projects: ProjectListItem[]; total: number }> {
  const result = await findProjectsPage(workspaceId, filter);
  return {
    projects: await withCompanyNamesForProjects(workspaceId, result.projects),
    total: result.total,
  };
}

export async function getProjectForWorkspace(
  workspaceId: string,
  projectId: string,
): Promise<ProjectDetailRecord> {
  const project = await findProjectById(workspaceId, projectId);

  if (!project) {
    throw new AppError("NOT_FOUND", "Project not found.");
  }

  return withCompanyPeople(workspaceId, await withCompanyNames(workspaceId, project));
}

export async function createProjectForWorkspace(
  workspaceId: string,
  actorId: string,
  input: CreateProjectInput,
  options: CreateProjectOptions = {},
): Promise<ProjectRecord> {
  await validateOptionalAssignableMember(workspaceId, input.ownerId, "Owner");
  await validateOptionalAssignableMember(workspaceId, input.assignedTo, "Assigned to");

  if (input.reference) {
    const duplicate = await findProjectByReference(workspaceId, input.reference);

    if (duplicate) {
      throw new AppError("CONFLICT", "A project with this reference already exists.");
    }
  }

  const companies = normalizeProjectCompanies(input.companies);
  if (!options.allowWithoutPrimaryCompany) {
    requirePrimaryBusinessCompany(companies);
  }
  await validateProjectCompanies(workspaceId, companies);
  await validatePropertyTypeId(workspaceId, input.propertyTypeId);

  const location = input.location
    ? locationFromManualInput(input.location)
    : emptyProjectLocation();
  const legacy = legacyFieldsFromLocation(location);

  const project = await withCompanyNames(
    workspaceId,
    await createProject({
      workspaceId,
      createdBy: actorId,
      name: input.name,
      reference: input.reference ?? null,
      projectType: input.projectType ?? null,
      commercialStage: input.commercialStage ?? null,
      propertyTypeId: input.propertyTypeId ?? null,
      website: input.website ?? null,
      defaultDripCampaignId: input.defaultDripCampaignId ?? null,
      statusId: input.statusId ?? null,
      address: input.address ?? legacy.address,
      city: input.city ?? legacy.city,
      country: input.country ?? legacy.country,
      location,
      companies,
      description: input.description ?? null,
      ownerId: input.ownerId ?? null,
      assignedTo: input.assignedTo ?? null,
    }),
  );

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
  if (input.commercialStage !== undefined) {
    updatePayload.commercialStage = input.commercialStage;
  }
  if (input.propertyTypeId !== undefined) {
    await validatePropertyTypeId(workspaceId, input.propertyTypeId);
    updatePayload.propertyTypeId = input.propertyTypeId;
  }
  if (input.website !== undefined) {
    updatePayload.website = input.website?.trim() || null;
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
    const location = input.location
      ? locationFromManualInput(input.location, existing.location)
      : emptyProjectLocation();
    updatePayload.location = location;
    if (input.address === undefined || input.city === undefined || input.country === undefined) {
      const legacy = legacyFieldsFromLocation(location);
      if (input.address === undefined) {
        updatePayload.address = legacy.address;
      }
      if (input.city === undefined) {
        updatePayload.city = legacy.city;
      }
      if (input.country === undefined) {
        updatePayload.country = legacy.country;
      }
    }
  }
  if (input.companies !== undefined) {
    const companies = normalizeProjectCompanies(input.companies);
    requirePrimaryBusinessCompany(companies);
    await validateProjectCompanies(workspaceId, companies);
    updatePayload.companies = companies;
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

  return withCompanyNames(workspaceId, updated);
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
