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
  options?: { leadId?: string; propertyId?: string },
): string {
  const params = new URLSearchParams();
  if (options?.leadId) params.set("leadId", options.leadId);
  if (options?.propertyId) params.set("propertyId", options.propertyId);
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

export function createPeerEscapeHref(args: {
  workspaceSlug: string;
  side: "lead" | "property";
  projectId: string;
}): string {
  const base =
    args.side === "property"
      ? workspacePath(args.workspaceSlug, "properties", "new")
      : workspacePath(args.workspaceSlug, "leads", "new");
  return `${base}?projectId=${encodeURIComponent(args.projectId)}`;
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
