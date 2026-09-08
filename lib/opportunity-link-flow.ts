import type { EntityComboboxOption } from "@/components/domain/entity-combobox";
import { workspacePath } from "@/lib/workspace-paths";

export type OpportunityLinkEntity = {
  id: string;
  label: string;
  meta?: string;
  projectId: string | null;
  projectName: string | null;
  currency?: string;
};

export function createOpportunityHref(
  workspaceSlug: string,
  options?: {
    leadId?: string;
    propertyId?: string;
    lockLead?: boolean;
    lockProperty?: boolean;
  },
): string {
  const params = new URLSearchParams();
  if (options?.leadId) params.set("leadId", options.leadId);
  if (options?.propertyId) params.set("propertyId", options.propertyId);
  if (options?.lockLead) params.set("lockLead", "1");
  if (options?.lockProperty) params.set("lockProperty", "1");
  const query = params.toString();
  return query
    ? `${workspacePath(workspaceSlug, "opportunities", "new")}?${query}`
    : workspacePath(workspaceSlug, "opportunities", "new");
}

export function toComboboxOption(entity: OpportunityLinkEntity): EntityComboboxOption {
  return {
    id: entity.id,
    label: entity.label,
    meta: entity.meta,
    projectId: entity.projectId,
    projectName: entity.projectName,
    data: entity.currency ? { currency: entity.currency } : undefined,
  };
}

export function mapLeadApiRecord(lead: {
  id: string;
  fullName: string;
  email?: string | null;
  projectId?: string | null;
  project?: { id: string; name: string } | null;
}): OpportunityLinkEntity {
  return {
    id: lead.id,
    label: lead.fullName,
    meta: [lead.email, lead.project?.name].filter(Boolean).join(" · ") || undefined,
    projectId: lead.project?.id ?? lead.projectId ?? null,
    projectName: lead.project?.name ?? null,
  };
}

export function mapPropertyApiRecord(property: {
  id: string;
  title: string;
  reference?: string | null;
  currency?: string;
  projectId?: string | null;
  project?: { id: string; name: string } | null;
}): OpportunityLinkEntity {
  return {
    id: property.id,
    label: property.title,
    meta:
      [property.reference, property.project?.name].filter(Boolean).join(" · ") || undefined,
    projectId: property.project?.id ?? property.projectId ?? null,
    projectName: property.project?.name ?? null,
    currency: property.currency,
  };
}

export function buildOpportunityPeerEmptyMessage(args: {
  side: "lead" | "property";
  projectName: string | null;
  total: number | null;
}): string {
  const projectLabel = args.projectName ? `“${args.projectName}”` : "this project";
  if (args.total === 0) {
    return args.side === "property"
      ? `No properties in ${projectLabel}. Create one to continue.`
      : `No leads in ${projectLabel}. Create one to continue.`;
  }
  return args.side === "property"
    ? `No matching properties in ${projectLabel}.`
    : `No matching leads in ${projectLabel}.`;
}

export function buildSameProjectHint(args: {
  lockedSide: "lead" | "property" | null;
  projectName: string | null;
  peerTotal: number | null;
}): string | null {
  if (!args.projectName) {
    return null;
  }
  if (args.peerTotal === null) {
    return `Scoped to project “${args.projectName}”.`;
  }
  const noun =
    args.lockedSide === "lead"
      ? args.peerTotal === 1
        ? "property"
        : "properties"
      : args.peerTotal === 1
        ? "lead"
        : "leads";
  return `Project “${args.projectName}” · ${args.peerTotal} ${noun}`;
}

export function isSafeWorkspaceReturnTo(
  returnTo: string,
  workspaceSlug: string,
): boolean {
  if (!returnTo.startsWith("/") || returnTo.startsWith("//")) {
    return false;
  }
  if (returnTo.includes("://") || returnTo.includes("\\")) {
    return false;
  }
  const workspacePrefix = `/w/${workspaceSlug}/`;
  if (!returnTo.startsWith(workspacePrefix)) {
    return false;
  }
  return true;
}

export function isSafeOpportunityReturnTo(
  returnTo: string,
  workspaceSlug: string,
): boolean {
  if (!isSafeWorkspaceReturnTo(returnTo, workspaceSlug)) {
    return false;
  }
  const url = new URL(returnTo, "http://local.invalid");
  return url.pathname === workspacePath(workspaceSlug, "opportunities", "new");
}

/**
 * After creating a lead/property from an opportunity empty-state escape,
 * merge the new entity id into the encoded returnTo URL while keeping the
 * original locked peer and lock flags intact.
 */
export function resolveOpportunityReturnTo(
  returnTo: string,
  workspaceSlug: string,
  created: { leadId?: string; propertyId?: string },
): string | null {
  if (!isSafeOpportunityReturnTo(returnTo, workspaceSlug)) {
    return null;
  }
  const url = new URL(returnTo, "http://local.invalid");
  if (created.leadId) {
    url.searchParams.set("leadId", created.leadId);
  }
  if (created.propertyId) {
    url.searchParams.set("propertyId", created.propertyId);
  }
  return `${url.pathname}${url.search}`;
}

export function createPeerEscapeHref(args: {
  workspaceSlug: string;
  side: "lead" | "property";
  projectId: string;
  lockedLeadId?: string;
  lockedPropertyId?: string;
}): string {
  const base =
    args.side === "property"
      ? workspacePath(args.workspaceSlug, "properties", "new")
      : workspacePath(args.workspaceSlug, "leads", "new");

  const returnTo = createOpportunityHref(args.workspaceSlug, {
    leadId: args.lockedLeadId,
    propertyId: args.lockedPropertyId,
    lockLead: Boolean(args.lockedLeadId),
    lockProperty: Boolean(args.lockedPropertyId),
  });

  const params = new URLSearchParams();
  params.set("projectId", args.projectId);
  params.set("returnTo", returnTo);
  return `${base}?${params.toString()}`;
}

export function validateOpportunitySameProject(
  leadProjectId: string | null | undefined,
  propertyProjectId: string | null | undefined,
): string | null {
  if (!leadProjectId || !propertyProjectId) {
    return "Both lead and property must belong to a project.";
  }
  if (leadProjectId !== propertyProjectId) {
    return "Lead and property must belong to the same project. Pick a property from the lead’s project (or vice versa).";
  }
  return null;
}
