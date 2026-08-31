import "server-only";

import {
  canApplyIntelligenceValue,
  HUBSPOT_LEAD_INTELLIGENCE_PROPERTIES,
  normalizeIntelligenceText,
  readHubSpotContactIdFromLeadAttributes,
  type LeadIntelligenceValues,
} from "@/lib/lead-intelligence";
import {
  HUBSPOT_CMP_INTELLIGENCE_SIDE_EFFECT_GUARD,
  HUBSPOT_CMP_INTELLIGENCE_SOURCE,
  planHubSpotCmpLeadIntelligence,
  type HubSpotIntelligenceContactSnapshot,
} from "@/lib/hubspot-cmp-lead-intelligence";
import { createAuditLog } from "@/server/audit/create-audit-log";
import {
  findCompanyByNameForWorkspace,
  resolveOrCreateCompanyByName,
} from "@/server/services/companies";
import { fetchHubSpotContactsByIds } from "@/server/services/hubspot-client";
import { updateLeadForWorkspace } from "@/server/services/leads";
import { findIntegrations } from "@/server/repositories/integrations";
import { findLeadsWithHubSpotContactIdempotency, type LeadRecord } from "@/server/repositories/leads";
import { findAllWorkspaces, findWorkspaceById } from "@/server/repositories/workspaces";
import { decodeHubSpotCredentials } from "@/server/security/integration-credentials";

export type HubSpotCmpIntelligenceRow = {
  workspaceId: string;
  leadId: string;
  contactId: string | null;
  eligible: boolean;
  reason: string;
  applied: string[];
  skipped: Array<{ field: string; reason: string }>;
  companyName: string | null;
  wouldCreateCompany: boolean;
  persisted: boolean;
};

export type HubSpotCmpIntelligenceReport = {
  mode: "dry-run" | "execute";
  persisted: boolean;
  persistReason: string | null;
  scanned: number;
  eligible: number;
  applied: number;
  skipped: number;
  notCmp: number;
  missingContact: number;
  rows: HubSpotCmpIntelligenceRow[];
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

  const rows: HubSpotCmpIntelligenceRow[] = [];

  for (const workspace of resolved) {
    const integrations = await findIntegrations(workspace.id, {
      type: "hubspot",
      status: "active",
    });
    const integration = integrations[0];
    if (!integration?.credentialsEncrypted) {
      continue;
    }

    const credentials = decodeHubSpotCredentials(integration.credentialsEncrypted);
    const leads = await findLeadsWithHubSpotContactIdempotency(workspace.id);
    const contactIds = [
      ...new Set(
        leads
          .map((lead) => readHubSpotContactIdFromLeadAttributes(lead.attributes))
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const contacts = await fetchHubSpotContactsByIds({
      accessToken: credentials.accessToken,
      contactIds,
      properties: [...HUBSPOT_LEAD_INTELLIGENCE_PROPERTIES],
    });
    const contactsById = new Map(contacts.map((contact) => [contact.id, contact]));

    for (const lead of leads) {
      const contactId = readHubSpotContactIdFromLeadAttributes(lead.attributes);
      if (!contactId) {
        rows.push({
          workspaceId: workspace.id,
          leadId: lead.id,
          contactId: null,
          eligible: false,
          reason: "missing_hubspot_contact_id",
          applied: [],
          skipped: [],
          companyName: null,
          wouldCreateCompany: false,
          persisted: false,
        });
        continue;
      }

      const contact = contactsById.get(contactId);
      if (!contact) {
        rows.push({
          workspaceId: workspace.id,
          leadId: lead.id,
          contactId,
          eligible: false,
          reason: "hubspot_contact_not_found",
          applied: [],
          skipped: [],
          companyName: null,
          wouldCreateCompany: false,
          persisted: false,
        });
        continue;
      }

      const snapshot = snapshotFromRaw(contact);
      const companyName = normalizeIntelligenceText(snapshot.properties.company);
      const applyCompany = shouldApplyAssociatedCompany({
        existingCompanyId: lead.companyId ?? null,
        existingProvenance: lead.intelligenceProvenance,
        companyName,
      });

      let resolvedCompanyId: string | null = null;
      let wouldCreateCompany = false;
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
          wouldCreateCompany = Boolean(created?.created);
        } else {
          wouldCreateCompany = true;
          resolvedCompanyId = "dry-run-company";
        }
      }

      const plan = planHubSpotCmpLeadIntelligence({
        snapshot,
        existing: leadIntelligenceValues(lead),
        existingProvenance: lead.intelligenceProvenance,
        resolvedCompanyId,
        requireCmpProduct: true,
      });

      if (!plan.eligible) {
        rows.push({
          workspaceId: workspace.id,
          leadId: lead.id,
          contactId,
          eligible: false,
          reason: plan.reason,
          applied: [],
          skipped: [],
          companyName: plan.companyName,
          wouldCreateCompany: false,
          persisted: false,
        });
        continue;
      }

      const values = { ...plan.values };
      if (values.companyId === "dry-run-company") {
        delete values.companyId;
      }

      const row: HubSpotCmpIntelligenceRow = {
        workspaceId: workspace.id,
        leadId: lead.id,
        contactId,
        eligible: true,
        reason: plan.reason,
        applied: plan.applied,
        skipped: plan.skipped,
        companyName: plan.companyName,
        wouldCreateCompany,
        persisted: false,
      };

      if (persisted && plan.applied.length > 0) {
        await updateLeadForWorkspace(
          workspace.id,
          lead.id,
          integration.createdBy,
          values,
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
            applied: plan.applied,
            source: HUBSPOT_CMP_INTELLIGENCE_SOURCE,
            enrollCampaigns: false,
          },
        });
        row.persisted = true;
      }

      rows.push(row);
    }
  }

  return {
    mode: persisted ? "execute" : "dry-run",
    persisted,
    persistReason,
    scanned: rows.length,
    eligible: rows.filter((row) => row.eligible).length,
    applied: rows.filter((row) => row.applied.length > 0).length,
    skipped: rows.filter((row) => row.eligible && row.applied.length === 0).length,
    notCmp: rows.filter((row) => row.reason === "not_cmp_product").length,
    missingContact: rows.filter((row) => row.reason === "hubspot_contact_not_found").length,
    rows,
  };
}
