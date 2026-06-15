import "server-only";

import mongoose from "mongoose";

import { ActivityModel } from "@/models/activity";
import { CampaignEnrollmentModel } from "@/models/campaign-enrollment";
import { CampaignModel } from "@/models/campaign";
import { LeadModel } from "@/models/lead";
import { OpportunityModel } from "@/models/opportunity";
import { PropertyModel } from "@/models/property";
import { connectDb } from "@/server/db/mongoose";
import {
  createProject,
  findProjectByReference,
  findProjects,
} from "@/server/repositories/projects";
import { findAllWorkspaces } from "@/server/repositories/workspaces";

const DEFAULT_PROJECT_REFERENCE = "default";
const DEFAULT_PROJECT_NAME = "Default Project";

export type ProjectMigrationResult = {
  workspaceId: string;
  defaultProjectId: string;
  propertiesUpdated: number;
  leadsUpdated: number;
  opportunitiesUpdated: number;
  activitiesUpdated: number;
  enrollmentsUpdated: number;
};

async function findOrCreateDefaultProject(
  workspaceId: string,
  actorId: string,
): Promise<string> {
  const existing = await findProjectByReference(workspaceId, DEFAULT_PROJECT_REFERENCE);

  if (existing) {
    return existing.id;
  }

  const activeProjects = await findProjects(workspaceId, { includeArchived: false });

  if (activeProjects.length > 0) {
    return activeProjects[0].id;
  }

  const project = await createProject({
    workspaceId,
    name: DEFAULT_PROJECT_NAME,
    reference: DEFAULT_PROJECT_REFERENCE,
    description: "Auto-created default project for workspace data migration.",
    createdBy: actorId,
  });

  return project.id;
}

export async function migrateWorkspaceProjectScope(
  workspaceId: string,
  actorId: string,
): Promise<ProjectMigrationResult> {
  await connectDb();

  const defaultProjectId = await findOrCreateDefaultProject(workspaceId, actorId);
  const defaultObjectId = new mongoose.Types.ObjectId(defaultProjectId);
  const workspaceObjectId = new mongoose.Types.ObjectId(workspaceId);

  const propertiesUpdated = await PropertyModel.updateMany(
    {
      workspaceId: workspaceObjectId,
      $or: [{ projectId: null }, { projectId: { $exists: false } }],
    },
    { $set: { projectId: defaultObjectId } },
  ).then((result) => result.modifiedCount);

  const leadsUpdated = await LeadModel.updateMany(
    {
      workspaceId: workspaceObjectId,
      $or: [{ projectId: null }, { projectId: { $exists: false } }],
    },
    { $set: { projectId: defaultObjectId } },
  ).then((result) => result.modifiedCount);

  const opportunitiesWithoutProject = await OpportunityModel.find({
    workspaceId: workspaceObjectId,
    $or: [{ projectId: null }, { projectId: { $exists: false } }],
  }).lean();

  let opportunitiesUpdated = 0;

  for (const opportunity of opportunitiesWithoutProject) {
    let derivedProjectId: string | null = null;

    if (opportunity.leadId) {
      const lead = await LeadModel.findOne({
        _id: opportunity.leadId,
        workspaceId: workspaceObjectId,
      }).lean();

      if (lead?.projectId) {
        derivedProjectId = lead.projectId.toString();
      }
    }

    if (!derivedProjectId && opportunity.propertyId) {
      const property = await PropertyModel.findOne({
        _id: opportunity.propertyId,
        workspaceId: workspaceObjectId,
      }).lean();

      if (property?.projectId) {
        derivedProjectId = property.projectId.toString();
      }
    }

    await OpportunityModel.updateOne(
      { _id: opportunity._id },
      {
        $set: {
          projectId: new mongoose.Types.ObjectId(derivedProjectId ?? defaultProjectId),
        },
      },
    );
    opportunitiesUpdated += 1;
  }

  const activitiesWithoutProject = await ActivityModel.find({
    workspaceId: workspaceObjectId,
    $or: [{ projectId: null }, { projectId: { $exists: false } }],
  }).lean();

  let activitiesUpdated = 0;

  for (const activity of activitiesWithoutProject) {
    let derivedProjectId: string | null = null;

    if (activity.opportunityId) {
      const opportunity = await OpportunityModel.findOne({
        _id: activity.opportunityId,
        workspaceId: workspaceObjectId,
      }).lean();

      if (opportunity?.projectId) {
        derivedProjectId = opportunity.projectId.toString();
      }
    }

    if (!derivedProjectId && activity.leadId) {
      const lead = await LeadModel.findOne({
        _id: activity.leadId,
        workspaceId: workspaceObjectId,
      }).lean();

      if (lead?.projectId) {
        derivedProjectId = lead.projectId.toString();
      }
    }

    if (!derivedProjectId && activity.propertyId) {
      const property = await PropertyModel.findOne({
        _id: activity.propertyId,
        workspaceId: workspaceObjectId,
      }).lean();

      if (property?.projectId) {
        derivedProjectId = property.projectId.toString();
      }
    }

    await ActivityModel.updateOne(
      { _id: activity._id },
      {
        $set: {
          projectId: new mongoose.Types.ObjectId(derivedProjectId ?? defaultProjectId),
        },
      },
    );
    activitiesUpdated += 1;
  }

  // Campaigns: empty projectIds means all projects (no update needed for scope)
  await CampaignModel.updateMany(
    {
      workspaceId: workspaceObjectId,
      projectIds: { $exists: false },
    },
    { $set: { projectIds: [] } },
  );

  const enrollmentsWithoutProject = await CampaignEnrollmentModel.find({
    workspaceId: workspaceObjectId,
    $or: [{ projectId: null }, { projectId: { $exists: false } }],
    leadId: { $ne: null },
  }).lean();

  let enrollmentsUpdated = 0;

  for (const enrollment of enrollmentsWithoutProject) {
    if (!enrollment.leadId) {
      continue;
    }

    const lead = await LeadModel.findOne({
      _id: enrollment.leadId,
      workspaceId: workspaceObjectId,
    }).lean();

    if (lead?.projectId) {
      await CampaignEnrollmentModel.updateOne(
        { _id: enrollment._id },
        { $set: { projectId: lead.projectId } },
      );
      enrollmentsUpdated += 1;
    }
  }

  return {
    workspaceId,
    defaultProjectId,
    propertiesUpdated,
    leadsUpdated,
    opportunitiesUpdated,
    activitiesUpdated,
    enrollmentsUpdated,
  };
}

export async function migrateAllWorkspacesProjectScope(): Promise<ProjectMigrationResult[]> {
  await connectDb();
  const workspaces = await findAllWorkspaces();
  const results: ProjectMigrationResult[] = [];

  for (const workspace of workspaces) {
    results.push(await migrateWorkspaceProjectScope(workspace.id, workspace.createdBy));
  }

  return results;
}

export type ProjectScopeVerificationCounts = {
  leads: number;
  properties: number;
  opportunities: number;
  activities: number;
  enrollments: number;
};

export type ProjectScopeVerificationResult = {
  workspaceId: string;
  missing: ProjectScopeVerificationCounts;
  ok: boolean;
};

async function countMissingProjectId(
  workspaceObjectId: mongoose.Types.ObjectId,
  model: {
    countDocuments: (query: Record<string, unknown>) => Promise<number>;
  },
): Promise<number> {
  return model.countDocuments({
    workspaceId: workspaceObjectId,
    $or: [{ projectId: null }, { projectId: { $exists: false } }],
  });
}

export async function verifyProjectScopeMigration(
  workspaceId?: string,
): Promise<ProjectScopeVerificationResult[]> {
  await connectDb();

  const workspaces = workspaceId
    ? [{ id: workspaceId }]
    : (await findAllWorkspaces()).map((workspace) => ({ id: workspace.id }));

  const results: ProjectScopeVerificationResult[] = [];

  for (const workspace of workspaces) {
    const workspaceObjectId = new mongoose.Types.ObjectId(workspace.id);

    const [leads, properties, opportunities, activities, enrollments] = await Promise.all([
      countMissingProjectId(workspaceObjectId, LeadModel),
      countMissingProjectId(workspaceObjectId, PropertyModel),
      countMissingProjectId(workspaceObjectId, OpportunityModel),
      countMissingProjectId(workspaceObjectId, ActivityModel),
      CampaignEnrollmentModel.countDocuments({
        workspaceId: workspaceObjectId,
        leadId: { $ne: null },
        $or: [{ projectId: null }, { projectId: { $exists: false } }],
      }),
    ]);

    const missing = { leads, properties, opportunities, activities, enrollments };
    const ok = Object.values(missing).every((count) => count === 0);

    results.push({
      workspaceId: workspace.id,
      missing,
      ok,
    });
  }

  return results;
}
