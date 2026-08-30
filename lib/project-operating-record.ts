export const PROJECT_TYPES = [
  "development",
  "resale_mandate",
  "rental_project",
  "other",
] as const;

export type ProjectType = (typeof PROJECT_TYPES)[number];

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  development: "Development",
  resale_mandate: "Resale mandate",
  rental_project: "Rental project",
  other: "Other",
};

export const PROJECT_COMMERCIAL_STAGES = [
  "planned",
  "pre_launch",
  "live",
  "sold_closed",
] as const;

export type ProjectCommercialStage = (typeof PROJECT_COMMERCIAL_STAGES)[number];

export const PROJECT_COMMERCIAL_STAGE_LABELS: Record<ProjectCommercialStage, string> = {
  planned: "Planned",
  pre_launch: "Pre-launch",
  live: "Live",
  sold_closed: "Sold / closed",
};

export const PROJECT_COMPANY_ROLES = [
  "developer",
  "owner",
  "marketing_sales_partner",
] as const;

export type ProjectCompanyRole = (typeof PROJECT_COMPANY_ROLES)[number];

export const PROJECT_COMPANY_ROLE_LABELS: Record<ProjectCompanyRole, string> = {
  developer: "Developer / promoter",
  owner: "Owner",
  marketing_sales_partner: "Marketing / sales partner",
};

export type ProjectCompanyAssociationInput = {
  companyId: string;
  role: ProjectCompanyRole;
  isPrimary?: boolean;
};

export type ProjectCompanyAssociation = {
  companyId: string;
  role: ProjectCompanyRole;
  isPrimary: boolean;
};

export function normalizeCompanyNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeProjectCompanies(
  input: ProjectCompanyAssociationInput[] | null | undefined,
): ProjectCompanyAssociation[] {
  const seen = new Set<string>();
  const associations: ProjectCompanyAssociation[] = [];

  for (const item of input ?? []) {
    const key = `${item.companyId}:${item.role}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    associations.push({
      companyId: item.companyId,
      role: item.role,
      isPrimary: item.role === "developer" && item.isPrimary === true,
    });
  }

  const developers = associations.filter((item) => item.role === "developer");
  if (developers.length === 1) {
    developers[0]!.isPrimary = true;
  } else if (developers.length > 1 && !developers.some((item) => item.isPrimary)) {
    developers[0]!.isPrimary = true;
  } else if (developers.filter((item) => item.isPrimary).length > 1) {
    let kept = false;
    for (const developer of developers) {
      if (developer.isPrimary && !kept) {
        kept = true;
        continue;
      }
      developer.isPrimary = false;
    }
  }

  for (const item of associations) {
    if (item.role !== "developer") {
      item.isPrimary = false;
    }
  }

  return associations;
}

export function primaryDeveloperCompanyId(
  associations: Array<Pick<ProjectCompanyAssociation, "companyId" | "role" | "isPrimary">>,
): string | null {
  return associations.find((item) => item.role === "developer" && item.isPrimary)?.companyId ?? null;
}
