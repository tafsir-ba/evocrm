import "server-only";

import { connectDb } from "@/server/db/mongoose";
import { findDictionaryItems } from "@/server/repositories/dictionary-items";
import { findUserByEmail } from "@/server/repositories/users";
import { findWorkspaceBySlug } from "@/server/repositories/workspaces";
import { hashPassword } from "@/server/services/credentials-auth";
import { createActivityForWorkspace } from "@/server/services/activities";
import { createCampaignForWorkspace } from "@/server/services/campaigns";
import { createCampaignStepForWorkspace } from "@/server/services/campaign-steps";
import { createIntegrationForWorkspace } from "@/server/services/integrations";
import { createLeadForWorkspace } from "@/server/services/leads";
import { createOpportunityForWorkspace } from "@/server/services/opportunities";
import { createProjectForWorkspace } from "@/server/services/projects";
import { createPropertyForWorkspace } from "@/server/services/properties";
import { createTagForWorkspace } from "@/server/services/tags";
import { createWorkspaceForUser } from "@/server/services/workspaces";
import { createCredentialsUser } from "@/server/repositories/users";

export const DEMO_USER_EMAIL = "demo@evocrm.local";
export const DEMO_WORKSPACE_SLUG = "demo-agency";
export const DEMO_WORKSPACE_NAME = "Demo Agency";

export type DemoSeedResult = {
  userId: string;
  workspaceId: string;
  workspaceSlug: string;
  created: boolean;
};

async function ensureDemoUser(password: string): Promise<{ id: string; created: boolean }> {
  const existing = await findUserByEmail(DEMO_USER_EMAIL);

  if (existing) {
    return { id: existing.id, created: false };
  }

  const passwordHash = await hashPassword(password);
  const user = await createCredentialsUser({
    email: DEMO_USER_EMAIL,
    name: "Demo Owner",
    passwordHash,
  });

  return { id: user.id, created: true };
}

async function ensureDemoWorkspace(userId: string): Promise<{
  workspaceId: string;
  workspaceSlug: string;
  created: boolean;
}> {
  const existing = await findWorkspaceBySlug(DEMO_WORKSPACE_SLUG);

  if (existing) {
    return {
      workspaceId: existing.id,
      workspaceSlug: existing.slug,
      created: false,
    };
  }

  const workspace = await createWorkspaceForUser(userId, {
    name: DEMO_WORKSPACE_NAME,
    type: "agency",
    timezone: "UTC",
    defaultCurrency: "USD",
  });

  return {
    workspaceId: workspace.id,
    workspaceSlug: workspace.slug,
    created: true,
  };
}

async function seedDemoEntities(
  workspaceId: string,
  actorId: string,
): Promise<void> {
  const dictionaryItems = await findDictionaryItems(workspaceId);

  const leadStatus = dictionaryItems.find(
    (item) => item.type === "lead_status" && item.isDefault,
  );
  const leadSource = dictionaryItems.find(
    (item) => item.type === "lead_source" && item.key === "website",
  );
  const propertyStatus = dictionaryItems.find(
    (item) => item.type === "property_status" && item.isDefault,
  );
  const propertyType = dictionaryItems.find(
    (item) => item.type === "property_type" && item.isDefault,
  );
  const opportunityStatus = dictionaryItems.find(
    (item) => item.type === "opportunity_status" && item.isDefault,
  );
  const activityType = dictionaryItems.find(
    (item) => item.type === "activity_type" && item.isDefault,
  );
  const activityStatus = dictionaryItems.find(
    (item) => item.type === "activity_status" && item.key === "pending",
  );

  if (
    !leadStatus ||
    !propertyStatus ||
    !propertyType ||
    !opportunityStatus ||
    !activityType ||
    !activityStatus
  ) {
    throw new Error("Demo seed requires default dictionaries.");
  }

  const tag = await createTagForWorkspace(workspaceId, actorId, {
    name: "VIP",
    color: "#8B5CF6",
    entityTypes: ["lead", "property", "opportunity"],
  });

  const project = await createProjectForWorkspace(workspaceId, actorId, {
    name: "Riverside Residences",
    reference: "RR-001",
    city: "Lisbon",
  });

  const lead = await createLeadForWorkspace(workspaceId, actorId, {
    firstName: "Ana",
    lastName: "Silva",
    email: "ana.silva@example.com",
    phone: "+351912345678",
    statusId: leadStatus.id,
    sourceId: leadSource?.id,
    tags: [tag.id],
    notes: "Interested in 2-bedroom apartments near the river.",
  });

  const property = await createPropertyForWorkspace(
    workspaceId,
    actorId,
    {
      title: "Riverside 2BR — Unit 4B",
      reference: "PROP-4B",
      statusId: propertyStatus.id,
      typeId: propertyType.id,
      projectId: project.id,
      city: "Lisbon",
      price: 420000,
      bedrooms: 2,
      bathrooms: 2,
      tags: [tag.id],
    },
    "USD",
  );

  const opportunity = await createOpportunityForWorkspace(workspaceId, actorId, {
    leadId: lead.lead.id,
    propertyId: property.id,
    statusId: opportunityStatus.id,
    value: 420000,
  });

  await createActivityForWorkspace(workspaceId, actorId, {
    title: "Follow-up call with Ana",
    typeId: activityType.id,
    statusId: activityStatus.id,
    dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
    leadId: lead.lead.id,
    propertyId: property.id,
    opportunityId: opportunity.id,
  });

  const campaign = await createCampaignForWorkspace(workspaceId, actorId, {
    name: "Welcome nurture",
    audienceType: "leads",
  });

  await createCampaignStepForWorkspace(workspaceId, actorId, campaign.id, {
    order: 1,
    channel: "email",
    sendTime: "09:00",
    fromName: "Demo Agency",
    subject: "Welcome to Demo Agency",
    body: "<p>Thanks for your interest.</p>",
    delayDays: 0,
  });

  await createIntegrationForWorkspace(workspaceId, actorId, {
    type: "website",
    name: "Website lead capture (demo)",
  });
}

export async function seedDemoWorkspace(input?: {
  password?: string;
  dryRun?: boolean;
}): Promise<DemoSeedResult> {
  await connectDb();

  const password = input?.password ?? process.env.SEED_DEMO_PASSWORD ?? "DemoPass123!";

  if (input?.dryRun) {
    const existingWorkspace = await findWorkspaceBySlug(DEMO_WORKSPACE_SLUG);
    return {
      userId: "dry-run",
      workspaceId: existingWorkspace?.id ?? "dry-run",
      workspaceSlug: DEMO_WORKSPACE_SLUG,
      created: !existingWorkspace,
    };
  }

  const user = await ensureDemoUser(password);
  const workspace = await ensureDemoWorkspace(user.id);

  if (workspace.created) {
    await seedDemoEntities(workspace.workspaceId, user.id);
  }

  return {
    userId: user.id,
    workspaceId: workspace.workspaceId,
    workspaceSlug: workspace.workspaceSlug,
    created: workspace.created,
  };
}
