import "server-only";

import mongoose from "mongoose";

import { connectDb } from "@/server/db/mongoose";
import {
  HubSpotProjectMappingModel,
  type HubSpotProjectMappingDocument,
  HUBSPOT_PROJECT_MAPPING_STATUSES,
} from "@/models/hubspot-project-mapping";

export type HubSpotProjectMappingStatus =
  (typeof HUBSPOT_PROJECT_MAPPING_STATUSES)[number];

export type HubSpotProjectMappingRecord = {
  id: string;
  workspaceId: string;
  integrationId: string;
  hubspotProjectId: string;
  hubspotProjectName: string;
  evoProjectId: string | null;
  status: HubSpotProjectMappingStatus;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toRecord(document: HubSpotProjectMappingDocument): HubSpotProjectMappingRecord {
  return {
    id: document._id.toString(),
    workspaceId: document.workspaceId.toString(),
    integrationId: document.integrationId.toString(),
    hubspotProjectId: document.hubspotProjectId,
    hubspotProjectName: document.hubspotProjectName,
    evoProjectId: document.evoProjectId?.toString() ?? null,
    status: document.status as HubSpotProjectMappingStatus,
    reviewedBy: document.reviewedBy?.toString() ?? null,
    reviewedAt: document.reviewedAt ?? null,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export async function listHubSpotProjectMappings(
  workspaceId: string,
  integrationId: string,
): Promise<HubSpotProjectMappingRecord[]> {
  await connectDb();

  const documents = await HubSpotProjectMappingModel.find({
    workspaceId: new mongoose.Types.ObjectId(workspaceId),
    integrationId: new mongoose.Types.ObjectId(integrationId),
  })
    .sort({ hubspotProjectName: 1 })
    .lean<HubSpotProjectMappingDocument[]>();

  return documents.map(toRecord);
}

export async function upsertHubSpotProjectMappingInventory(input: {
  workspaceId: string;
  integrationId: string;
  projects: Array<{ hubspotProjectId: string; hubspotProjectName: string }>;
}): Promise<HubSpotProjectMappingRecord[]> {
  await connectDb();

  const workspaceObjectId = new mongoose.Types.ObjectId(input.workspaceId);
  const integrationObjectId = new mongoose.Types.ObjectId(input.integrationId);

  for (const project of input.projects) {
    await HubSpotProjectMappingModel.updateOne(
      {
        workspaceId: workspaceObjectId,
        integrationId: integrationObjectId,
        hubspotProjectId: project.hubspotProjectId,
      },
      {
        $set: {
          hubspotProjectName: project.hubspotProjectName,
        },
        $setOnInsert: {
          workspaceId: workspaceObjectId,
          integrationId: integrationObjectId,
          hubspotProjectId: project.hubspotProjectId,
          evoProjectId: null,
          status: "unmapped",
          reviewedBy: null,
          reviewedAt: null,
        },
      },
      { upsert: true },
    );
  }

  return listHubSpotProjectMappings(input.workspaceId, input.integrationId);
}

export async function updateHubSpotProjectMapping(input: {
  workspaceId: string;
  integrationId: string;
  hubspotProjectId: string;
  status: HubSpotProjectMappingStatus;
  evoProjectId: string | null;
  reviewedBy: string;
}): Promise<HubSpotProjectMappingRecord | null> {
  await connectDb();

  const document = await HubSpotProjectMappingModel.findOneAndUpdate(
    {
      workspaceId: new mongoose.Types.ObjectId(input.workspaceId),
      integrationId: new mongoose.Types.ObjectId(input.integrationId),
      hubspotProjectId: input.hubspotProjectId,
    },
    {
      $set: {
        status: input.status,
        evoProjectId: input.evoProjectId
          ? new mongoose.Types.ObjectId(input.evoProjectId)
          : null,
        reviewedBy: new mongoose.Types.ObjectId(input.reviewedBy),
        reviewedAt: new Date(),
      },
    },
    { new: true },
  ).lean<HubSpotProjectMappingDocument | null>();

  return document ? toRecord(document) : null;
}
