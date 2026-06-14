import "server-only";

import { createAuditLog } from "@/server/audit/create-audit-log";
import { connectDb } from "@/server/db/mongoose";
import {
  ActivityModel,
  CampaignEnrollmentModel,
  CampaignModel,
  CampaignSendModel,
  CampaignStepModel,
  DictionaryItemModel,
  DictionaryModel,
  DocumentModel,
  IntegrationLogModel,
  IntegrationModel,
  LeadModel,
  MembershipModel,
  OpportunityModel,
  ProjectModel,
  PropertyModel,
  RoleModel,
  TagModel,
  WorkspaceModel,
} from "@/models";
import {
  leanExportRecord,
  sanitizeExportCollection,
  toExportDocumentMetadata,
  toExportIntegrationRecord,
} from "@/server/services/workspace-export-sanitize";

export type WorkspaceExportBundle = {
  exportedAt: string;
  workspaceId: string;
  workspace: Record<string, unknown> | null;
  roles: Record<string, unknown>[];
  memberships: Record<string, unknown>[];
  dictionaries: Record<string, unknown>[];
  dictionaryItems: Record<string, unknown>[];
  tags: Record<string, unknown>[];
  projects: Record<string, unknown>[];
  leads: Record<string, unknown>[];
  properties: Record<string, unknown>[];
  opportunities: Record<string, unknown>[];
  activities: Record<string, unknown>[];
  documents: Record<string, unknown>[];
  campaigns: Record<string, unknown>[];
  campaignSteps: Record<string, unknown>[];
  campaignEnrollments: Record<string, unknown>[];
  campaignSends: Record<string, unknown>[];
  integrations: Record<string, unknown>[];
  integrationLogs: Record<string, unknown>[];
};

async function findWorkspaceScoped(
  model: {
    find: (filter: Record<string, unknown>) => {
      lean: () => Promise<Record<string, unknown>[]>;
    };
  },
  workspaceId: string,
): Promise<Record<string, unknown>[]> {
  const documents = await model.find({ workspaceId }).lean();
  return documents.map(leanExportRecord);
}

export async function exportWorkspaceData(input: {
  workspaceId: string;
  actorId: string;
}): Promise<WorkspaceExportBundle> {
  await connectDb();

  const workspace = await WorkspaceModel.findById(input.workspaceId).lean();
  const workspaceRecord = workspace ? leanExportRecord(workspace) : null;

  const [
    roles,
    memberships,
    dictionaries,
    dictionaryItems,
    tags,
    projects,
    leads,
    properties,
    opportunities,
    activities,
    documents,
    campaigns,
    campaignSteps,
    campaignEnrollments,
    campaignSends,
    integrations,
    integrationLogs,
  ] = await Promise.all([
    findWorkspaceScoped(RoleModel, input.workspaceId),
    findWorkspaceScoped(MembershipModel, input.workspaceId),
    findWorkspaceScoped(DictionaryModel, input.workspaceId),
    findWorkspaceScoped(DictionaryItemModel, input.workspaceId),
    findWorkspaceScoped(TagModel, input.workspaceId),
    findWorkspaceScoped(ProjectModel, input.workspaceId),
    findWorkspaceScoped(LeadModel, input.workspaceId),
    findWorkspaceScoped(PropertyModel, input.workspaceId),
    findWorkspaceScoped(OpportunityModel, input.workspaceId),
    findWorkspaceScoped(ActivityModel, input.workspaceId),
    findWorkspaceScoped(DocumentModel, input.workspaceId),
    findWorkspaceScoped(CampaignModel, input.workspaceId),
    findWorkspaceScoped(CampaignStepModel, input.workspaceId),
    findWorkspaceScoped(CampaignEnrollmentModel, input.workspaceId),
    findWorkspaceScoped(CampaignSendModel, input.workspaceId),
    findWorkspaceScoped(IntegrationModel, input.workspaceId),
    findWorkspaceScoped(IntegrationLogModel, input.workspaceId),
  ]);

  const bundle: WorkspaceExportBundle = {
    exportedAt: new Date().toISOString(),
    workspaceId: input.workspaceId,
    workspace: workspaceRecord,
    roles: sanitizeExportCollection(roles),
    memberships: sanitizeExportCollection(memberships),
    dictionaries: sanitizeExportCollection(dictionaries),
    dictionaryItems: sanitizeExportCollection(dictionaryItems),
    tags: sanitizeExportCollection(tags),
    projects: sanitizeExportCollection(projects),
    leads: sanitizeExportCollection(leads),
    properties: sanitizeExportCollection(properties),
    opportunities: sanitizeExportCollection(opportunities),
    activities: sanitizeExportCollection(activities),
    documents: documents.map((document) => toExportDocumentMetadata(document)),
    campaigns: sanitizeExportCollection(campaigns),
    campaignSteps: sanitizeExportCollection(campaignSteps),
    campaignEnrollments: sanitizeExportCollection(campaignEnrollments),
    campaignSends: sanitizeExportCollection(campaignSends),
    integrations: integrations.map((integration) =>
      toExportIntegrationRecord(integration),
    ),
    integrationLogs: sanitizeExportCollection(integrationLogs),
  };

  await createAuditLog({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: "workspace.exported",
    entityType: "workspace",
    entityId: input.workspaceId,
    after: {
      exportedAt: bundle.exportedAt,
      counts: {
        leads: bundle.leads.length,
        properties: bundle.properties.length,
        opportunities: bundle.opportunities.length,
        activities: bundle.activities.length,
        documents: bundle.documents.length,
        campaigns: bundle.campaigns.length,
        integrations: bundle.integrations.length,
      },
    },
  });

  return bundle;
}
