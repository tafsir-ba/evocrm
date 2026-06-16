import "server-only";

import type { CampaignEnrollmentRecord } from "@/server/repositories/campaign-enrollments";
import { findOpportunityById } from "@/server/repositories/opportunities";
import { findProjectById } from "@/server/repositories/projects";
import { findPropertyById } from "@/server/repositories/properties";
import type { CampaignVariableContext } from "@/lib/campaign-email";

type LeadLike = {
  firstName: string;
  lastName: string;
};

export async function buildCampaignVariableContext(input: {
  workspaceId: string;
  enrollment: CampaignEnrollmentRecord;
  lead: LeadLike;
  unsubscribeUrl: string;
}): Promise<CampaignVariableContext> {
  const context: CampaignVariableContext = {
    firstName: input.lead.firstName,
    lastName: input.lead.lastName,
    unsubscribeUrl: input.unsubscribeUrl,
  };

  const projectId = input.enrollment.projectId;
  if (projectId) {
    const project = await findProjectById(input.workspaceId, projectId);
    if (project) {
      context.projectName = project.name;
    }
  }

  if (input.enrollment.opportunityId) {
    const opportunity = await findOpportunityById(
      input.workspaceId,
      input.enrollment.opportunityId,
    );
    if (opportunity?.propertyId) {
      const property = await findPropertyById(input.workspaceId, opportunity.propertyId);
      if (property) {
        context.propertyName = property.title;
        context.propertyUrl = property.reference;
      }
    }
  }

  return context;
}
