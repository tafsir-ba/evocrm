import { getCountries } from "libphonenumber-js/max";

import {
  compactLocationKey,
  normalizeCountryCode,
} from "@/lib/project-location";

/** Project fields the WhatsApp handoff reads. Present on project list and detail API records. */
export type WhatsAppProjectSource = {
  id: string;
  name: string;
  country?: string | null;
  location?: {
    countryCode?: string | null;
    countryName?: string | null;
  } | null;
  whatsappTemplate?: string | null;
};

export type WhatsAppProjectInfo = {
  id: string;
  name: string;
  /** Country used to interpret local phone numbers, or null when the project has no usable geography. */
  countryCode: string | null;
  whatsappTemplate: string | null;
};

const SUPPORTED_COUNTRIES = new Set<string>(getCountries());

const COUNTRY_NAME_ALIASES: Record<string, string> = {
  suisse: "CH",
  schweiz: "CH",
  svizzera: "CH",
  svizra: "CH",
  jamaique: "JM",
};

let englishCountryNames: Map<string, string> | null = null;

function countryCodeFromName(name: string | null | undefined): string | null {
  const key = name ? compactLocationKey(name) : "";
  if (!key) {
    return null;
  }
  if (COUNTRY_NAME_ALIASES[key]) {
    return COUNTRY_NAME_ALIASES[key];
  }
  if (!englishCountryNames) {
    englishCountryNames = new Map();
    try {
      const names = new Intl.DisplayNames(["en"], { type: "region" });
      for (const code of SUPPORTED_COUNTRIES) {
        const label = names.of(code);
        if (label && label !== code) {
          englishCountryNames.set(compactLocationKey(label), code);
        }
      }
    } catch {
      // Without Intl region names only the aliases above are recognized.
    }
  }
  return englishCountryNames.get(key) ?? null;
}

/**
 * Structured `location.countryCode` wins. Legacy country names are used only when every stored
 * name points to the same recognized country. Nothing is defaulted.
 */
export function projectPhoneCountry(
  project: WhatsAppProjectSource | null | undefined,
): string | null {
  if (!project) {
    return null;
  }
  const structured = normalizeCountryCode(
    project.location?.countryCode ?? null,
  );
  if (structured && SUPPORTED_COUNTRIES.has(structured)) {
    return structured;
  }
  const names = [project.location?.countryName, project.country].filter(
    (value): value is string => Boolean(value?.trim()),
  );
  const codes = new Set(names.map(countryCodeFromName));
  if (codes.size !== 1 || codes.has(null)) {
    return null;
  }
  return [...codes][0]!;
}

export function toWhatsAppProjectInfo(
  project: WhatsAppProjectSource,
): WhatsAppProjectInfo {
  return {
    id: project.id,
    name: project.name,
    countryCode: projectPhoneCountry(project),
    whatsappTemplate: project.whatsappTemplate?.trim()
      ? project.whatsappTemplate
      : null,
  };
}

export type LeadProjectLinks = {
  project?: { id: string } | null;
  projectMemberships?: Array<{ projectId: string; isPrimary?: boolean }>;
  secondaryProjects?: Array<{ id: string }>;
};

export type WhatsAppProjectChoice =
  | {
      status: "resolved";
      projectId: string;
      basis: "active" | "primary" | "only_project";
    }
  | { status: "ambiguous"; projectIds: string[] }
  | { status: "none" };

export function leadProjectIds(lead: LeadProjectLinks): string[] {
  const ids = [
    lead.project?.id,
    ...(lead.projectMemberships ?? []).map(
      (membership) => membership.projectId,
    ),
    ...(lead.secondaryProjects ?? []).map((project) => project.id),
  ].filter((id): id is string => Boolean(id));
  return [...new Set(ids)];
}

/**
 * Picks the project whose geography interprets a local phone number: the active project when the
 * lead belongs to it, else the lead's primary project. Several projects without a primary need a
 * human choice.
 */
export function chooseWhatsAppProject(
  lead: LeadProjectLinks,
  activeProjectId: string | null | undefined,
): WhatsAppProjectChoice {
  const ids = leadProjectIds(lead);
  if (activeProjectId && ids.includes(activeProjectId)) {
    return { status: "resolved", projectId: activeProjectId, basis: "active" };
  }
  const primary =
    lead.project?.id ??
    (lead.projectMemberships ?? []).find((membership) => membership.isPrimary)
      ?.projectId;
  if (primary) {
    return { status: "resolved", projectId: primary, basis: "primary" };
  }
  if (ids.length === 1) {
    return { status: "resolved", projectId: ids[0]!, basis: "only_project" };
  }
  if (ids.length > 1) {
    return { status: "ambiguous", projectIds: ids };
  }
  return { status: "none" };
}

/** Project id from a lead list return path such as /w/acme/projects/<id>/leads or ?projectId=<id>. */
export function activeProjectIdFromHref(
  href: string | null | undefined,
): string | null {
  if (!href) {
    return null;
  }
  try {
    const url = new URL(href, "http://local");
    const fromQuery = url.searchParams.get("projectId")?.trim();
    if (fromQuery) {
      return fromQuery;
    }
    const match = url.pathname.match(/\/projects\/([a-fA-F0-9]{24})(?:\/|$)/);
    return match ? match[1]! : null;
  } catch {
    return null;
  }
}
