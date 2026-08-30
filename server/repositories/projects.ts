import "server-only";

import mongoose from "mongoose";

import { summarizeProjectInboundDemand } from "@/lib/inbound-received-at";
import type { InboundReceivedBasis } from "@/lib/inbound-received-at";
import { countAttachedCampaignsByProject } from "@/lib/project-attached-campaigns";
import {
  canPaginateProjectsInDatabase,
  paginateProjectBrowser,
  type ProjectBrowserSort,
  type ProjectBrowserSortDir,
  type ProjectBrowserView,
} from "@/lib/project-browser";
import {
  emptyProjectLocation,
  normalizeProjectLocation,
  type ProjectLocation,
} from "@/lib/project-location";
import { ActivityModel } from "@/models/activity";
import { CampaignModel } from "@/models/campaign";
import { LeadModel } from "@/models/lead";
import { OpportunityModel } from "@/models/opportunity";
import { PropertyModel } from "@/models/property";
import { connectDb } from "@/server/db/mongoose";
import { ProjectModel, type ProjectDocument } from "@/models/project";
import { withWorkspaceScope } from "@/server/workspaces/with-workspace-scope";
import type { ProjectCommercialStage, ProjectCompanyAssociation } from "@/lib/project-operating-record";
import { isValidObjectId } from "@/server/utils/mongo-id";

export type ProjectCompanyLink = ProjectCompanyAssociation & {
  company?: { id: string; name: string } | null;
};

export type ProjectRecord = {
  id: string;
  workspaceId: string;
  name: string;
  reference: string | null;
  projectType: string | null;
  commercialStage: ProjectCommercialStage | null;
  propertyTypeId: string | null;
  website: string | null;
  defaultDripCampaignId: string | null;
  statusId: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  location?: ProjectLocation | null;
  companies: ProjectCompanyLink[];
  description: string | null;
  createdBy: string;
  ownerId: string | null;
  assignedTo: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ProjectListCounts = {
  leads: number;
  properties: number;
  opportunities: number;
  activeCampaigns: number;
  lastActivityAt: Date | null;
  lastGenuineInboundAt: Date | null;
  lastGenuineInboundBasis: InboundReceivedBasis | null;
};

export type ProjectListItem = ProjectRecord & {
  counts?: ProjectListCounts;
};

function toProjectRecord(document: ProjectDocument): ProjectRecord {
  return {
    id: document._id.toString(),
    workspaceId: document.workspaceId.toString(),
    name: document.name,
    reference: document.reference ?? null,
    projectType: document.projectType ?? null,
    commercialStage: (document.commercialStage as ProjectRecord["commercialStage"]) ?? null,
    propertyTypeId: document.propertyTypeId?.toString() ?? null,
    website: document.website ?? null,
    defaultDripCampaignId: document.defaultDripCampaignId?.toString() ?? null,
    statusId: document.statusId?.toString() ?? null,
    address: document.address ?? null,
    city: document.city ?? null,
    country: document.country ?? null,
    location: normalizeProjectLocation(
      (document as ProjectDocument & { location?: ProjectLocation | null }).location,
    ),
    companies: (document.companies ?? []).map((link) => {
      const provenance = (link as { provenance?: ProjectCompanyLink["provenance"] }).provenance;
      return {
        companyId: link.companyId.toString(),
        role: link.role as ProjectCompanyLink["role"],
        isPrimary: Boolean(link.isPrimary),
        ...(provenance ? { provenance } : {}),
      };
    }),
    description: document.description ?? null,
    createdBy: document.createdBy.toString(),
    ownerId: document.ownerId?.toString() ?? null,
    assignedTo: document.assignedTo?.toString() ?? null,
    archivedAt: document.archivedAt ?? null,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export type ProjectListFilter = {
  includeArchived?: boolean;
  search?: string;
  assignedTo?: string;
  countryCode?: string;
  cantonCode?: string;
  municipality?: string;
  withCounts?: boolean;
  view?: ProjectBrowserView;
  sort?: ProjectBrowserSort;
  sortDir?: ProjectBrowserSortDir;
  page?: number;
  pageSize?: number;
};

function buildListQuery(filter: ProjectListFilter): Record<string, unknown> {
  const query: Record<string, unknown> = {};

  if (filter.view === "archived") {
    query.archivedAt = { $ne: null };
  } else if (filter.view || !filter.includeArchived) {
    query.archivedAt = null;
  }

  if (filter.assignedTo) {
    query.assignedTo = filter.assignedTo;
  }

  if (filter.countryCode) {
    query["location.countryCode"] = filter.countryCode;
  }
  if (filter.cantonCode) {
    query["location.cantonCode"] = filter.cantonCode;
  }
  if (filter.municipality) {
    query["location.municipality"] = filter.municipality;
  }

  if (filter.search) {
    const escaped = filter.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "i");
    query.$or = [
      { name: regex },
      { reference: regex },
      { city: regex },
      { country: regex },
      { "location.municipality": regex },
      { "location.countryName": regex },
      { "location.cantonName": regex },
      { "location.postalCode": regex },
    ];
  }

  return query;
}

function emptyProjectCounts(): ProjectListCounts {
  return {
    leads: 0,
    properties: 0,
    opportunities: 0,
    activeCampaigns: 0,
    lastActivityAt: null,
    lastGenuineInboundAt: null,
    lastGenuineInboundBasis: null,
  };
}

async function loadProjectCounts(
  workspaceId: string,
  projectIds: string[],
  options: { inventory?: boolean } = {},
): Promise<Map<string, ProjectListCounts>> {
  const counts = new Map<string, ProjectListCounts>();

  if (projectIds.length === 0) {
    return counts;
  }

  await connectDb();
  const workspaceObjectId = new mongoose.Types.ObjectId(workspaceId);
  const projectObjectIds = projectIds.map((id) => new mongoose.Types.ObjectId(id));

  const includeInventory = options.inventory !== false;

  const [leadCounts, propertyCounts, opportunityCounts, attachedCampaigns, activityDates, inboundLeads] =
    await Promise.all([
      LeadModel.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
        {
          $match: {
            workspaceId: workspaceObjectId,
            projectId: { $in: projectObjectIds },
            archivedAt: null,
          },
        },
        { $group: { _id: "$projectId", count: { $sum: 1 } } },
      ]),
      includeInventory
        ? PropertyModel.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
            {
              $match: {
                workspaceId: workspaceObjectId,
                projectId: { $in: projectObjectIds },
                archivedAt: null,
              },
            },
            { $group: { _id: "$projectId", count: { $sum: 1 } } },
          ])
        : Promise.resolve([]),
      includeInventory
        ? OpportunityModel.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
            {
              $match: {
                workspaceId: workspaceObjectId,
                projectId: { $in: projectObjectIds },
                archivedAt: null,
              },
            },
            { $group: { _id: "$projectId", count: { $sum: 1 } } },
          ])
        : Promise.resolve([]),
      includeInventory
        ? CampaignModel.find({
            workspaceId: workspaceObjectId,
            status: "active",
            archivedAt: null,
            projectIds: { $in: projectObjectIds },
          })
            .select({ projectIds: 1 })
            .lean<Array<{ projectIds?: mongoose.Types.ObjectId[] }>>()
        : Promise.resolve([]),
      includeInventory
        ? ActivityModel.aggregate<{ _id: mongoose.Types.ObjectId; lastActivityAt: Date }>([
            {
              $match: {
                workspaceId: workspaceObjectId,
                projectId: { $in: projectObjectIds },
                archivedAt: null,
              },
            },
            { $group: { _id: "$projectId", lastActivityAt: { $max: "$updatedAt" } } },
          ])
        : Promise.resolve([]),
      LeadModel.find({
        workspaceId: workspaceObjectId,
        projectId: { $in: projectObjectIds },
        archivedAt: null,
      })
        .select({ projectId: 1, createdAt: 1, attributes: 1 })
        .lean<
          Array<{
            projectId?: mongoose.Types.ObjectId;
            createdAt?: Date;
            attributes?: Record<string, unknown>;
          }>
        >(),
    ]);

  for (const projectId of projectIds) {
    counts.set(projectId, emptyProjectCounts());
  }

  const inboundByProject = summarizeProjectInboundDemand(
    inboundLeads.map((lead) => ({
      projectId: lead.projectId?.toString() ?? null,
      createdAt: lead.createdAt ?? null,
      attributes: lead.attributes ?? {},
    })),
  );
  for (const [projectId, inbound] of inboundByProject) {
    const existing = counts.get(projectId);
    if (existing) {
      existing.lastGenuineInboundAt = inbound.at;
      existing.lastGenuineInboundBasis = inbound.basis;
    }
  }

  for (const row of leadCounts) {
    const existing = counts.get(row._id.toString());
    if (existing) existing.leads = row.count;
  }
  for (const row of propertyCounts) {
    const existing = counts.get(row._id.toString());
    if (existing) existing.properties = row.count;
  }
  for (const row of opportunityCounts) {
    const existing = counts.get(row._id.toString());
    if (existing) existing.opportunities = row.count;
  }
  const attachedByProject = countAttachedCampaignsByProject(
    attachedCampaigns.map((campaign) => ({
      projectIds: (campaign.projectIds ?? []).map((id) => id.toString()),
    })),
    projectIds,
  );
  for (const [projectId, attachedCount] of attachedByProject) {
    const existing = counts.get(projectId);
    if (existing) existing.activeCampaigns = attachedCount;
  }
  for (const row of activityDates) {
    const existing = counts.get(row._id.toString());
    if (existing) existing.lastActivityAt = row.lastActivityAt;
  }

  return counts;
}

export async function findProjects(
  workspaceId: string,
  filter: ProjectListFilter = {},
): Promise<ProjectListItem[]> {
  await connectDb();
  const documents = await ProjectModel.find(
    withWorkspaceScope(workspaceId, buildListQuery(filter)),
  )
    .sort({ createdAt: -1 })
    .lean<ProjectDocument[]>();

  const records = documents.map(toProjectRecord);

  if (!filter.withCounts) {
    return records;
  }

  const countMap = await loadProjectCounts(
    workspaceId,
    records.map((project) => project.id),
  );

  return records.map((project) => ({
    ...project,
    counts: countMap.get(project.id),
  }));
}

export async function findProjectsPage(
  workspaceId: string,
  filter: ProjectListFilter = {},
): Promise<{ projects: ProjectListItem[]; total: number }> {
  await connectDb();
  const view = filter.view ?? "all";
  const sort = filter.sort ?? (filter.withCounts ? "inbound" : "name");
  const sortDir = filter.sortDir ?? (sort === "name" || sort === "status" ? "asc" : "desc");
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filter.pageSize ?? 25));
  const query = withWorkspaceScope(workspaceId, buildListQuery({ ...filter, view }));

  if (canPaginateProjectsInDatabase({ view, sort, withCounts: filter.withCounts })) {
    const skip = (page - 1) * pageSize;
    const [documents, total] = await Promise.all([
      ProjectModel.find(query)
        .sort({ name: sortDir === "asc" ? 1 : -1 })
        .skip(skip)
        .limit(pageSize)
        .lean<ProjectDocument[]>(),
      ProjectModel.countDocuments(query),
    ]);

    return {
      projects: documents.map(toProjectRecord),
      total,
    };
  }

  const documents = await ProjectModel.find(query).lean<ProjectDocument[]>();
  const records = documents.map(toProjectRecord);
  const demandMap = filter.withCounts
    ? await loadProjectCounts(
        workspaceId,
        records.map((project) => project.id),
        { inventory: false },
      )
    : new Map<string, ProjectListCounts>();

  const withDemand = records.map((project) => ({
    ...project,
    counts: demandMap.get(project.id) ?? emptyProjectCounts(),
  }));

  const pageResult = paginateProjectBrowser(withDemand, {
    view,
    sort,
    sortDir,
    page,
    pageSize,
  });

  if (!filter.withCounts || pageResult.projects.length === 0) {
    return pageResult;
  }

  const inventoryMap = await loadProjectCounts(
    workspaceId,
    pageResult.projects.map((project) => project.id),
    { inventory: true },
  );

  return {
    total: pageResult.total,
    projects: pageResult.projects.map((project) => {
      const inventory = inventoryMap.get(project.id);
      const demand = project.counts ?? emptyProjectCounts();
      return {
        ...project,
        counts: {
          ...demand,
          properties: inventory?.properties ?? 0,
          opportunities: inventory?.opportunities ?? 0,
          activeCampaigns: inventory?.activeCampaigns ?? 0,
          lastActivityAt: inventory?.lastActivityAt ?? null,
        },
      };
    }),
  };
}

export async function findProjectById(
  workspaceId: string,
  projectId: string,
): Promise<ProjectRecord | null> {
  if (!isValidObjectId(projectId)) {
    return null;
  }

  await connectDb();
  const document = await ProjectModel.findOne(
    withWorkspaceScope(workspaceId, { _id: projectId }),
  ).lean<ProjectDocument>();
  return document ? toProjectRecord(document) : null;
}

export async function findProjectByReference(
  workspaceId: string,
  reference: string,
): Promise<ProjectRecord | null> {
  await connectDb();
  const document = await ProjectModel.findOne(
    withWorkspaceScope(workspaceId, { reference: reference.trim() }),
  ).lean<ProjectDocument>();
  return document ? toProjectRecord(document) : null;
}

export async function createProject(input: {
  workspaceId: string;
  name: string;
  reference?: string | null;
  projectType?: string | null;
  commercialStage?: ProjectCommercialStage | null;
  propertyTypeId?: string | null;
  website?: string | null;
  defaultDripCampaignId?: string | null;
  statusId?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  location?: ProjectLocation | null;
  companies?: ProjectCompanyAssociation[];
  description?: string | null;
  createdBy: string;
  ownerId?: string | null;
  assignedTo?: string | null;
}): Promise<ProjectRecord> {
  await connectDb();
  const document = await ProjectModel.create({
    workspaceId: input.workspaceId,
    name: input.name.trim(),
    reference: input.reference?.trim() || null,
    projectType: input.projectType ?? null,
    commercialStage: input.commercialStage ?? null,
    propertyTypeId: input.propertyTypeId ?? null,
    website: input.website?.trim() || null,
    defaultDripCampaignId: input.defaultDripCampaignId ?? null,
    statusId: input.statusId ?? null,
    address: input.address?.trim() || null,
    city: input.city?.trim() || null,
    country: input.country?.trim() || null,
    location: normalizeProjectLocation(input.location ?? emptyProjectLocation()),
    companies: input.companies ?? [],
    description: input.description?.trim() || null,
    createdBy: input.createdBy,
    ownerId: input.ownerId ?? null,
    assignedTo: input.assignedTo ?? null,
    archivedAt: null,
  });
  return toProjectRecord(document.toObject() as ProjectDocument);
}

export async function updateProject(
  workspaceId: string,
  projectId: string,
  input: Partial<{
    name: string;
    reference: string | null;
    projectType: string | null;
    commercialStage: ProjectCommercialStage | null;
    propertyTypeId: string | null;
    website: string | null;
    defaultDripCampaignId: string | null;
    statusId: string | null;
    address: string | null;
    city: string | null;
    country: string | null;
    location: ProjectLocation | null;
    companies: ProjectCompanyAssociation[];
    description: string | null;
    ownerId: string | null;
    assignedTo: string | null;
  }>,
): Promise<ProjectRecord | null> {
  await connectDb();
  const updatePayload = { ...input };
  if (input.location !== undefined) {
    updatePayload.location = input.location
      ? normalizeProjectLocation(input.location)
      : emptyProjectLocation();
  }
  const document = await ProjectModel.findOneAndUpdate(
    withWorkspaceScope(workspaceId, { _id: projectId, archivedAt: null }),
    { $set: updatePayload },
    { new: true },
  ).lean<ProjectDocument>();
  return document ? toProjectRecord(document) : null;
}

export async function archiveProject(
  workspaceId: string,
  projectId: string,
): Promise<ProjectRecord | null> {
  await connectDb();
  const document = await ProjectModel.findOneAndUpdate(
    withWorkspaceScope(workspaceId, { _id: projectId, archivedAt: null }),
    { $set: { archivedAt: new Date() } },
    { new: true },
  ).lean<ProjectDocument>();
  return document ? toProjectRecord(document) : null;
}

export async function countActiveProjects(workspaceId: string): Promise<number> {
  await connectDb();
  return ProjectModel.countDocuments(
    withWorkspaceScope(workspaceId, { archivedAt: null }),
  );
}
