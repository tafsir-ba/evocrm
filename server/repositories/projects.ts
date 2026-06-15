import "server-only";

import mongoose from "mongoose";

import { ActivityModel } from "@/models/activity";
import { CampaignModel } from "@/models/campaign";
import { LeadModel } from "@/models/lead";
import { OpportunityModel } from "@/models/opportunity";
import { PropertyModel } from "@/models/property";
import { connectDb } from "@/server/db/mongoose";
import { ProjectModel, type ProjectDocument } from "@/models/project";
import { withWorkspaceScope } from "@/server/workspaces/with-workspace-scope";

export type ProjectRecord = {
  id: string;
  workspaceId: string;
  name: string;
  reference: string | null;
  projectType: string | null;
  defaultDripCampaignId: string | null;
  statusId: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
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
    defaultDripCampaignId: document.defaultDripCampaignId?.toString() ?? null,
    statusId: document.statusId?.toString() ?? null,
    address: document.address ?? null,
    city: document.city ?? null,
    country: document.country ?? null,
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
  withCounts?: boolean;
};

function buildListQuery(filter: ProjectListFilter): Record<string, unknown> {
  const query: Record<string, unknown> = {};

  if (!filter.includeArchived) {
    query.archivedAt = null;
  }

  if (filter.assignedTo) {
    query.assignedTo = filter.assignedTo;
  }

  if (filter.search) {
    const escaped = filter.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "i");
    query.$or = [{ name: regex }, { reference: regex }, { city: regex }];
  }

  return query;
}

async function loadProjectCounts(
  workspaceId: string,
  projectIds: string[],
): Promise<Map<string, ProjectListCounts>> {
  const counts = new Map<string, ProjectListCounts>();

  if (projectIds.length === 0) {
    return counts;
  }

  await connectDb();
  const workspaceObjectId = new mongoose.Types.ObjectId(workspaceId);
  const projectObjectIds = projectIds.map((id) => new mongoose.Types.ObjectId(id));

  const [leadCounts, propertyCounts, opportunityCounts, campaignCounts, activityDates] =
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
      PropertyModel.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
        {
          $match: {
            workspaceId: workspaceObjectId,
            projectId: { $in: projectObjectIds },
            archivedAt: null,
          },
        },
        { $group: { _id: "$projectId", count: { $sum: 1 } } },
      ]),
      OpportunityModel.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
        {
          $match: {
            workspaceId: workspaceObjectId,
            projectId: { $in: projectObjectIds },
            archivedAt: null,
          },
        },
        { $group: { _id: "$projectId", count: { $sum: 1 } } },
      ]),
      CampaignModel.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
        {
          $match: {
            workspaceId: workspaceObjectId,
            status: "active",
            archivedAt: null,
            $or: [
              { projectIds: { $size: 0 } },
              { projectIds: { $in: projectObjectIds } },
            ],
          },
        },
        { $unwind: { path: "$projectIds", preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: "$projectIds",
            count: { $sum: 1 },
          },
        },
      ]),
      ActivityModel.aggregate<{ _id: mongoose.Types.ObjectId; lastActivityAt: Date }>([
        {
          $match: {
            workspaceId: workspaceObjectId,
            projectId: { $in: projectObjectIds },
            archivedAt: null,
          },
        },
        { $group: { _id: "$projectId", lastActivityAt: { $max: "$updatedAt" } } },
      ]),
    ]);

  for (const projectId of projectIds) {
    counts.set(projectId, {
      leads: 0,
      properties: 0,
      opportunities: 0,
      activeCampaigns: 0,
      lastActivityAt: null,
    });
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
  for (const row of campaignCounts) {
    if (!row._id) {
      for (const projectId of projectIds) {
        const existing = counts.get(projectId);
        if (existing) existing.activeCampaigns += row.count;
      }
      continue;
    }
    const existing = counts.get(row._id.toString());
    if (existing) existing.activeCampaigns = row.count;
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

export async function findProjectById(
  workspaceId: string,
  projectId: string,
): Promise<ProjectRecord | null> {
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
  defaultDripCampaignId?: string | null;
  statusId?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
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
    defaultDripCampaignId: input.defaultDripCampaignId ?? null,
    statusId: input.statusId ?? null,
    address: input.address?.trim() || null,
    city: input.city?.trim() || null,
    country: input.country?.trim() || null,
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
    defaultDripCampaignId: string | null;
    statusId: string | null;
    address: string | null;
    city: string | null;
    country: string | null;
    description: string | null;
    ownerId: string | null;
    assignedTo: string | null;
  }>,
): Promise<ProjectRecord | null> {
  await connectDb();
  const document = await ProjectModel.findOneAndUpdate(
    withWorkspaceScope(workspaceId, { _id: projectId, archivedAt: null }),
    { $set: input },
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
