import "server-only";

import mongoose from "mongoose";

import { ActivityModel } from "@/models/activity";
import { CampaignEnrollmentModel } from "@/models/campaign-enrollment";
import { CampaignSendModel } from "@/models/campaign-send";
import { DocumentModel } from "@/models/document";
import { ImportRowResultModel } from "@/models/import-row-result";
import { LeadModel } from "@/models/lead";
import { LeadProjectMembershipModel } from "@/models/lead-project-membership";
import { OpportunityModel } from "@/models/opportunity";
import { connectDb } from "@/server/db/mongoose";
import { deleteObject } from "@/server/storage/spaces";
import { withWorkspaceScope } from "@/server/workspaces/with-workspace-scope";

function toObjectIds(ids: string[]): mongoose.Types.ObjectId[] {
  return ids
    .filter((id) => mongoose.isValidObjectId(id))
    .map((id) => new mongoose.Types.ObjectId(id));
}

function buildLeadRelationFilter(
  leadObjectIds: mongoose.Types.ObjectId[],
  opportunityObjectIds: mongoose.Types.ObjectId[],
): Record<string, unknown>[] {
  const filters: Record<string, unknown>[] = [{ leadId: { $in: leadObjectIds } }];

  if (opportunityObjectIds.length > 0) {
    filters.push({ opportunityId: { $in: opportunityObjectIds } });
  }

  return filters;
}

export async function purgeLeadsByIds(
  workspaceId: string,
  leadIds: string[],
): Promise<number> {
  if (leadIds.length === 0) {
    return 0;
  }

  await connectDb();

  const leadObjectIds = toObjectIds(leadIds);
  if (leadObjectIds.length === 0) {
    return 0;
  }

  const workspaceObjectId = new mongoose.Types.ObjectId(workspaceId);
  const leadIdFilter = { $in: leadObjectIds };

  const opportunities = await OpportunityModel.find(
    withWorkspaceScope(workspaceId, { leadId: leadIdFilter }),
  )
    .select({ _id: 1 })
    .lean<Array<{ _id: mongoose.Types.ObjectId }>>();
  const opportunityObjectIds = opportunities.map((opportunity) => opportunity._id);
  const relationFilters = buildLeadRelationFilter(leadObjectIds, opportunityObjectIds);

  const enrollments = await CampaignEnrollmentModel.find(
    withWorkspaceScope(workspaceId, { $or: relationFilters }),
  )
    .select({ _id: 1 })
    .lean<Array<{ _id: mongoose.Types.ObjectId }>>();
  const enrollmentObjectIds = enrollments.map((enrollment) => enrollment._id);

  const sendFilters: Record<string, unknown>[] = [{ leadId: leadIdFilter }];
  if (opportunityObjectIds.length > 0) {
    sendFilters.push({ opportunityId: { $in: opportunityObjectIds } });
  }
  if (enrollmentObjectIds.length > 0) {
    sendFilters.push({ enrollmentId: { $in: enrollmentObjectIds } });
  }

  const documents = await DocumentModel.find({
    workspaceId: workspaceObjectId,
    $or: [
      { linkedEntityType: "lead", linkedEntityId: { $in: leadObjectIds } },
      ...(opportunityObjectIds.length > 0
        ? [
            {
              linkedEntityType: "opportunity",
              linkedEntityId: { $in: opportunityObjectIds },
            },
          ]
        : []),
    ],
  })
    .select({ storageKey: 1 })
    .lean<Array<{ storageKey: string }>>();

  await Promise.allSettled(documents.map((document) => deleteObject(document.storageKey)));

  await CampaignSendModel.deleteMany(
    withWorkspaceScope(workspaceId, { $or: sendFilters }),
  );
  await CampaignEnrollmentModel.deleteMany(
    withWorkspaceScope(workspaceId, { $or: relationFilters }),
  );
  await DocumentModel.deleteMany({
    workspaceId: workspaceObjectId,
    $or: [
      { linkedEntityType: "lead", linkedEntityId: { $in: leadObjectIds } },
      ...(opportunityObjectIds.length > 0
        ? [
            {
              linkedEntityType: "opportunity",
              linkedEntityId: { $in: opportunityObjectIds },
            },
          ]
        : []),
    ],
  });
  await ActivityModel.deleteMany(
    withWorkspaceScope(workspaceId, { $or: relationFilters }),
  );
  await OpportunityModel.deleteMany(
    withWorkspaceScope(workspaceId, { leadId: leadIdFilter }),
  );
  await ImportRowResultModel.deleteMany({
    workspaceId: workspaceObjectId,
    entityId: { $in: leadIds },
  });

  await LeadProjectMembershipModel.deleteMany(
    withWorkspaceScope(workspaceId, { leadId: { $in: leadObjectIds } }),
  );

  const result = await LeadModel.deleteMany(
    withWorkspaceScope(workspaceId, { _id: { $in: leadObjectIds } }),
  );

  return result.deletedCount ?? 0;
}
