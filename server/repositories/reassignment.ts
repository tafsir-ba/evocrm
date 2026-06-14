import "server-only";

import mongoose from "mongoose";

import { ActivityModel } from "@/models/activity";
import { LeadModel } from "@/models/lead";
import { OpportunityModel } from "@/models/opportunity";
import { ProjectModel } from "@/models/project";
import { PropertyModel } from "@/models/property";
import { connectDb } from "@/server/db/mongoose";

export type ReassignmentCounts = {
  leads: number;
  properties: number;
  opportunities: number;
  activities: number;
  projects: number;
};

export type ReassignmentUpdateCounts = ReassignmentCounts;

function toObjectId(userId: string): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId(userId);
}

function activeAssignedFilter(workspaceId: string, userId: string) {
  return {
    workspaceId: new mongoose.Types.ObjectId(workspaceId),
    assignedTo: toObjectId(userId),
    archivedAt: null,
  };
}

export async function countAssignedRecords(
  workspaceId: string,
  userId: string,
): Promise<ReassignmentCounts> {
  await connectDb();

  const [leads, properties, opportunities, activities, projects] =
    await Promise.all([
      LeadModel.countDocuments(activeAssignedFilter(workspaceId, userId)),
      PropertyModel.countDocuments(activeAssignedFilter(workspaceId, userId)),
      OpportunityModel.countDocuments(activeAssignedFilter(workspaceId, userId)),
      ActivityModel.countDocuments(activeAssignedFilter(workspaceId, userId)),
      ProjectModel.countDocuments(activeAssignedFilter(workspaceId, userId)),
    ]);

  return { leads, properties, opportunities, activities, projects };
}

export function hasAssignedRecords(counts: ReassignmentCounts): boolean {
  return (
    counts.leads > 0 ||
    counts.properties > 0 ||
    counts.opportunities > 0 ||
    counts.activities > 0 ||
    counts.projects > 0
  );
}

export async function reassignAssignedRecords(
  workspaceId: string,
  sourceUserId: string,
  replacementUserId: string,
): Promise<ReassignmentUpdateCounts> {
  await connectDb();

  const filter = activeAssignedFilter(workspaceId, sourceUserId);
  const replacement = toObjectId(replacementUserId);
  const update = { $set: { assignedTo: replacement } };

  const [leads, properties, opportunities, activities, projects] =
    await Promise.all([
      LeadModel.updateMany(filter, update),
      PropertyModel.updateMany(filter, update),
      OpportunityModel.updateMany(filter, update),
      ActivityModel.updateMany(filter, update),
      ProjectModel.updateMany(filter, update),
    ]);

  return {
    leads: leads.modifiedCount,
    properties: properties.modifiedCount,
    opportunities: opportunities.modifiedCount,
    activities: activities.modifiedCount,
    projects: projects.modifiedCount,
  };
}
