import "server-only";

import mongoose from "mongoose";

import { ActivityModel } from "@/models/activity";
import { AuditLogModel } from "@/models/audit-log";
import { CampaignModel } from "@/models/campaign";
import { CompanyModel } from "@/models/company";
import { CampaignEnrollmentModel } from "@/models/campaign-enrollment";
import { CampaignSendModel } from "@/models/campaign-send";
import { CampaignStepModel } from "@/models/campaign-step";
import { DictionaryModel } from "@/models/dictionary";
import { DictionaryItemModel } from "@/models/dictionary-item";
import { DocumentModel } from "@/models/document";
import { FeedbackModel } from "@/models/feedback";
import { IntegrationModel } from "@/models/integration";
import { IntegrationLogModel } from "@/models/integration-log";
import { ImportJobModel } from "@/models/import-job";
import { ImportRowResultModel } from "@/models/import-row-result";
import { LeadModel } from "@/models/lead";
import { LeadProjectMembershipModel } from "@/models/lead-project-membership";
import { MembershipModel } from "@/models/membership";
import { OpportunityModel } from "@/models/opportunity";
import { ProjectModel } from "@/models/project";
import { PropertyModel } from "@/models/property";
import { RoleModel } from "@/models/role";
import { TagModel } from "@/models/tag";
import { AppError } from "@/server/errors";
import { connectDb } from "@/server/db/mongoose";
import { deleteImportFileBuffer } from "@/server/imports/import-file-storage";
import type { ImportFileStorageProvider } from "@/server/imports/import-file-storage";
import { requireWorkspaceOwner } from "@/server/permissions/owner-protection";
import {
  deleteWorkspaceById,
  findWorkspaceById,
} from "@/server/repositories/workspaces";
import { deleteObject } from "@/server/storage/spaces";
import type { DeleteWorkspaceInput } from "@/server/validation/workspace-deletion";

export async function deleteWorkspaceForOwner(input: {
  workspaceId: string;
  actorUserId: string;
  confirmation: DeleteWorkspaceInput;
}): Promise<{ slug: string }> {
  const workspace = await findWorkspaceById(input.workspaceId);

  if (!workspace) {
    throw new AppError("NOT_FOUND", "Workspace not found.");
  }

  await requireWorkspaceOwner(input.workspaceId, input.actorUserId);

  if (input.confirmation.confirmName !== workspace.name) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Workspace name confirmation does not match.",
    );
  }

  await deleteWorkspaceData(input.workspaceId);
  await deleteWorkspaceById(input.workspaceId);

  return { slug: workspace.slug };
}

async function deleteWorkspaceData(workspaceId: string): Promise<void> {
  await connectDb();

  const workspaceObjectId = new mongoose.Types.ObjectId(workspaceId);

  const documents = await DocumentModel.find({ workspaceId: workspaceObjectId })
    .select("storageKey")
    .lean<Array<{ storageKey: string }>>();

  await Promise.allSettled(
    documents.map((document) => deleteObject(document.storageKey)),
  );

  const feedbackItems = await FeedbackModel.find({ workspaceId: workspaceObjectId })
    .select("screenshots")
    .lean<Array<{ screenshots: Array<{ storageKey: string }> }>>();

  const feedbackStorageKeys = feedbackItems.flatMap((item) =>
    item.screenshots.map((screenshot) => screenshot.storageKey),
  );

  await Promise.allSettled(feedbackStorageKeys.map((storageKey) => deleteObject(storageKey)));

  const importJobs = await ImportJobModel.find({ workspaceId: workspaceObjectId })
    .select("storageKey storageProvider")
    .lean<Array<{ storageKey: string; storageProvider: ImportFileStorageProvider }>>();

  await Promise.allSettled(
    importJobs.map((job) =>
      deleteImportFileBuffer({
        storageKey: job.storageKey,
        storageProvider: job.storageProvider,
      }),
    ),
  );

  await ImportRowResultModel.deleteMany({ workspaceId: workspaceObjectId });
  await ImportJobModel.deleteMany({ workspaceId: workspaceObjectId });

  await CampaignSendModel.deleteMany({ workspaceId: workspaceObjectId });
  await CampaignEnrollmentModel.deleteMany({ workspaceId: workspaceObjectId });
  await CampaignStepModel.deleteMany({ workspaceId: workspaceObjectId });
  await CampaignModel.deleteMany({ workspaceId: workspaceObjectId });
  await DocumentModel.deleteMany({ workspaceId: workspaceObjectId });
  await ActivityModel.deleteMany({ workspaceId: workspaceObjectId });
  await OpportunityModel.deleteMany({ workspaceId: workspaceObjectId });
  await LeadProjectMembershipModel.deleteMany({ workspaceId: workspaceObjectId });
  await LeadModel.deleteMany({ workspaceId: workspaceObjectId });
  await PropertyModel.deleteMany({ workspaceId: workspaceObjectId });
  await ProjectModel.deleteMany({ workspaceId: workspaceObjectId });
  await CompanyModel.deleteMany({ workspaceId: workspaceObjectId });
  await IntegrationLogModel.deleteMany({ workspaceId: workspaceObjectId });
  await IntegrationModel.deleteMany({ workspaceId: workspaceObjectId });
  await DictionaryItemModel.deleteMany({ workspaceId: workspaceObjectId });
  await DictionaryModel.deleteMany({ workspaceId: workspaceObjectId });
  await TagModel.deleteMany({ workspaceId: workspaceObjectId });
  await MembershipModel.deleteMany({ workspaceId: workspaceObjectId });
  await RoleModel.deleteMany({ workspaceId: workspaceObjectId });
  await AuditLogModel.deleteMany({ workspaceId: workspaceObjectId });
  await FeedbackModel.deleteMany({ workspaceId: workspaceObjectId });
}
