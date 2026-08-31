import "server-only";

import {
  canApplyIntelligenceValue,
  HUBSPOT_LEAD_INTELLIGENCE_PROPERTIES,
  normalizeIntelligenceText,
  readHubSpotContactIdFromLeadAttributes,
  type LeadIntelligenceField,
  type LeadIntelligenceValues,
} from "@/lib/lead-intelligence";
import { CMP_PROJECT_ID } from "@/lib/hubspot-cmp-membership";
import {
  assertCmpIntelligenceWritePayload,
  HUBSPOT_CMP_INTELLIGENCE_SIDE_EFFECT_GUARD,
  HUBSPOT_CMP_INTELLIGENCE_SOURCE,
  planHubSpotCmpLeadIntelligence,
  summarizeCmpIntelligenceRows,
  type CmpIntelligenceMatchMethod,
  type CmpIntelligenceRow,
  type HubSpotIntelligenceContactSnapshot,
} from "@/lib/hubspot-cmp-lead-intelligence";
import { createAuditLog } from "@/server/audit/create-audit-log";
import {
  findCompanyByNameForWorkspace,
  resolveOrCreateCompanyByName,
} from "@/server/services/companies";
import {
  fetchHubSpotContactsByIds,
  searchHubSpotContactsByEmail,
  type HubSpotContact,
  type HubSpotContactRaw,
} from "@/server/services/hubspot-client";
import { updateLeadForWorkspace } from "@/server/services/leads";
import { findIntegrations } from "@/server/repositories/integrations";
import {
  findActiveLeadsByProjectId,
  findLeadsByIds,
  type LeadRecord,
} from "@/server/repositories/leads";
import { findLeadIdsForProjectMembership } from "@/server/repositories/lead-project-memberships";
import { findAllWorkspaces, findWorkspaceById } from "@/server/repositories/workspaces";
import { decodeHubSpotCredentials } from "@/server/security/integration-credentials";

export type HubSpotCmpIntelligenceReport = ReturnType<typeof summarizeCmpIntelligenceRows> & {
  enrollCampaigns: false;
  mutateLeadProject: false;
  mutateLeadStatus: false;
  mutateConsent: false;
  rows: CmpIntelligenceRow[];
};

function leadIntelligenceValues(lead: LeadRecord): LeadIntelligenceValues {
  return {
    industry: lead.industry ?? null,
    jobTitle: lead.jobTitle ?? null,
    stateRegion: lead.stateRegion ?? null,
    companyId: lead.companyId ?? null,
  };
}

function snapshotFromRaw(input: {
  id: string;
  properties: Record<string, string | null>;
}): HubSpotIntelligenceContactSnapshot {
  return {
    contactId: input.id,
    properties: {
      industry: input.properties.industry,
      jobtitle: input.properties.jobtitle,
      state: input.properties.state,
      hs_state_code: input.properties.hs_state_code,
      company: input.properties.company,
      associatedcompanyid: input.properties.associatedcompanyid,
      product_intersted_in: input.properties.product_intersted_in,
    },
  };
}

function snapshotFromContact(contact: HubSpotContact): HubSpotIntelligenceContactSnapshot {
  return snapshotFromRaw({
    id: contact.id,
    properties: contact.properties,
  });
}

function incomingAvailableFields(
  incoming: Partial<LeadIntelligenceValues>,
): LeadIntelligenceField[] {
  const fields: LeadIntelligenceField[] = [];
  for (const field of ["industry", "jobTitle", "stateRegion", "companyId"] as const) {
    if (!normalizeIntelligenceText(incoming[field] ?? null)) {
      continue;
    }
    fields.push(field);
  }
  return fields;
}

export function shouldApplyAssociatedCompany(input: {
  existingCompanyId: string | null;
  existingProvenance: LeadRecord["intelligenceProvenance"];
  companyName: string | null;
}): boolean {
  return (
    canApplyIntelligenceValue({
      existingValue: input.existingCompanyId,
      existingProvenance: input.existingProvenance.companyId,
      incomingValue: input.companyName,
    }) === "apply"
  );
}

async function loadCmpMembershipLeads(
  workspaceId: string,
): Promise<LeadRecord[]> {
  const [byProject, membershipIds] = await Promise.all([
    findActiveLeadsByProjectId(workspaceId, CMP_PROJECT_ID),
    findLeadIdsForProjectMembership(workspaceId, CMP_PROJECT_ID),
  ]);
  const byId = new Map(byProject.map((lead) => [lead.id, lead]));
  const missing = membershipIds.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    const extra = await findLeadsByIds(workspaceId, missing);
    for (const lead of extra) {
      if (lead.archivedAt) {
        continue;
      }
      byId.set(lead.id, lead);
    }
  }
  return [...byId.values()];
}

function resolveHubSpotAccessToken(integration: {
  credentialsEncrypted?: string | null;
  createdBy: string;
}): { accessToken: string; actorId: string } {
  if (integration.credentialsEncrypted) {
    try {
      const credentials = decodeHubSpotCredentials(integration.credentialsEncrypted);
      if (credentials.accessToken?.trim()) {
        return { accessToken: credentials.accessToken, actorId: integration.createdBy };
      }
    } catch {
      // One-time operator backfill may use HUBSPOT_ACCESS_TOKEN when vault decrypt is unavailable.
    }
  }
  const envToken = process.env.HUBSPOT_ACCESS_TOKEN?.trim();
  if (envToken) {
    return { accessToken: envToken, actorId: integration.createdBy };
  }
  throw new Error("hubspot_access_token_unavailable");
}

export async function runHubSpotCmpLeadIntelligenceEnrichment(input: {
  workspaceId?: string | null;
  execute?: boolean;
  confirmWrite?: boolean;
}): Promise<HubSpotCmpIntelligenceReport> {
  const execute = Boolean(input.execute);
  const confirmWrite = Boolean(input.confirmWrite);
  const persisted = execute && confirmWrite;
  const persistReason = !execute
    ? "dry_run"
    : !confirmWrite
      ? "missing_confirm_write"
      : null;

  const workspaces = input.workspaceId
    ? [await findWorkspaceById(input.workspaceId)]
    : await findAllWorkspaces();
  const resolved = workspaces.filter((workspace): workspace is NonNullable<typeof workspace> =>
    Boolean(workspace),
  );

  const rows: CmpIntelligenceRow[] = [];

  for (const workspace of resolved) {
    const integrations = await findIntegrations(workspace.id, {
      type: "hubspot",
      status: "active",
    });
    const integration = integrations[0];
    if (!integration) {
      continue;
    }
    if (!integration.credentialsEncrypted && !process.env.HUBSPOT_ACCESS_TOKEN?.trim()) {
      continue;
    }

    const { accessToken, actorId } = resolveHubSpotAccessToken(integration);

    const leads = await loadCmpMembershipLeads(workspace.id);
    const contactIds = [
      ...new Set(
        leads
          .map((lead) => readHubSpotContactIdFromLeadAttributes(lead.attributes))
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    let contactsById = new Map<string, HubSpotContactRaw>();
    try {
      const contacts = await fetchHubSpotContactsByIds({
        accessToken,
        contactIds,
        properties: [...HUBSPOT_LEAD_INTELLIGENCE_PROPERTIES],
      });
      contactsById = new Map(contacts.map((contact) => [contact.id, contact]));
    } catch (error) {
      for (const lead of leads) {
        rows.push({
          leadId: lead.id,
          contactId: readHubSpotContactIdFromLeadAttributes(lead.attributes),
          matchMethod: "none",
          eligible: false,
          reason: "hubspot_batch_failed",
          applied: [],
          skipped: [],
          incomingAvailable: [],
          persisted: false,
          errorCode: error instanceof Error ? error.message.slice(0, 80) : "hubspot_batch_failed",
        });
      }
      continue;
    }

    for (const lead of leads) {
      try {
        let contactId = readHubSpotContactIdFromLeadAttributes(lead.attributes);
        let matchMethod: CmpIntelligenceMatchMethod = contactId ? "hubspot_contact_id" : "none";
        let snapshot: HubSpotIntelligenceContactSnapshot | null = null;

        if (contactId) {
          const contact = contactsById.get(contactId);
          if (contact) {
            snapshot = snapshotFromRaw(contact);
          }
        }

        if (!snapshot && !contactId && lead.email) {
          const emailMatches = await searchHubSpotContactsByEmail({
            accessToken,
            email: lead.email,
          });
          if (emailMatches.length > 1) {
            rows.push({
              leadId: lead.id,
              contactId: null,
              matchMethod: "none",
              eligible: false,
              reason: "email_ambiguous",
              applied: [],
              skipped: [],
              incomingAvailable: [],
              persisted: false,
            });
            continue;
          }
          if (emailMatches.length === 1) {
            snapshot = snapshotFromContact(emailMatches[0]!);
            contactId = emailMatches[0]!.id;
            matchMethod = "unique_email";
          }
        }

        if (!contactId) {
          rows.push({
            leadId: lead.id,
            contactId: null,
            matchMethod: "none",
            eligible: false,
            reason: "missing_hubspot_contact_id",
            applied: [],
            skipped: [],
            incomingAvailable: [],
            persisted: false,
          });
          continue;
        }

        if (!snapshot) {
          rows.push({
            leadId: lead.id,
            contactId,
            matchMethod,
            eligible: false,
            reason: "hubspot_contact_not_found",
            applied: [],
            skipped: [],
            incomingAvailable: [],
            persisted: false,
          });
          continue;
        }

        const companyName = normalizeIntelligenceText(snapshot.properties.company);
        const applyCompany = shouldApplyAssociatedCompany({
          existingCompanyId: lead.companyId ?? null,
          existingProvenance: lead.intelligenceProvenance,
          companyName,
        });

        let resolvedCompanyId: string | null = null;
        if (applyCompany && companyName) {
          const existingCompany = await findCompanyByNameForWorkspace(workspace.id, companyName);
          if (existingCompany) {
            resolvedCompanyId = existingCompany.id;
          } else if (persisted) {
            const created = await resolveOrCreateCompanyByName(
              workspace.id,
              integration.createdBy,
              companyName,
            );
            resolvedCompanyId = created?.company.id ?? null;
          } else {
            resolvedCompanyId = "dry-run-company";
          }
        }

        const plan = planHubSpotCmpLeadIntelligence({
          snapshot,
          existing: leadIntelligenceValues(lead),
          existingProvenance: lead.intelligenceProvenance,
          resolvedCompanyId,
          requireCmpProduct: false,
        });

        const patch: Partial<LeadIntelligenceValues> = { ...plan.values };
        if (patch.companyId === "dry-run-company") {
          delete patch.companyId;
        }
        assertCmpIntelligenceWritePayload(patch);

        const applied = plan.applied.filter((field) => {
          if (field !== "companyId") {
            return true;
          }
          return Boolean(patch.companyId) || (!persisted && Boolean(companyName));
        });

        const row: CmpIntelligenceRow = {
          leadId: lead.id,
          contactId,
          matchMethod,
          eligible: true,
          reason: plan.reason,
          applied,
          skipped: plan.skipped,
          incomingAvailable: incomingAvailableFields({
            industry: plan.incoming.industry ?? null,
            jobTitle: plan.incoming.jobTitle ?? null,
            stateRegion: plan.incoming.stateRegion ?? null,
            companyId: companyName,
          }),
          persisted: false,
        };

        if (persisted && Object.keys(patch).length > 0) {
          await updateLeadForWorkspace(
            workspace.id,
            lead.id,
            integration.createdBy,
            patch,
            {
              ...HUBSPOT_CMP_INTELLIGENCE_SIDE_EFFECT_GUARD,
              intelligenceMethod: "hubspot",
              intelligenceSource: HUBSPOT_CMP_INTELLIGENCE_SOURCE,
            },
          );
          await createAuditLog({
            workspaceId: workspace.id,
            actorId: integration.createdBy,
            action: "lead.hubspot_cmp_intelligence_enriched",
            entityType: "lead",
            entityId: lead.id,
            after: {
              applied,
              source: HUBSPOT_CMP_INTELLIGENCE_SOURCE,
              enrollCampaigns: false,
              mutateLeadProject: false,
              mutateLeadStatus: false,
              mutateConsent: false,
            },
          });
          row.persisted = true;
        }

        rows.push(row);
      } catch (error) {
        rows.push({
          leadId: lead.id,
          contactId: readHubSpotContactIdFromLeadAttributes(lead.attributes),
          matchMethod: "none",
          eligible: false,
          reason: "enrichment_error",
          applied: [],
          skipped: [],
          incomingAvailable: [],
          persisted: false,
          errorCode: error instanceof Error ? error.message.slice(0, 80) : "enrichment_error",
        });
      }
    }
  }

  const summary = summarizeCmpIntelligenceRows(rows, { persisted, persistReason });
  return {
    ...summary,
    enrollCampaigns: false,
    mutateLeadProject: false,
    mutateLeadStatus: false,
    mutateConsent: false,
    rows,
  };
}

export { HUBSPOT_CMP_INTELLIGENCE_SIDE_EFFECT_GUARD };
