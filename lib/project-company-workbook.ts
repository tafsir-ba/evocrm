import {
  BILLED_LINKED_NOTE,
  WORKBOOK_COMPANY_MAPPING,
  WORKBOOK_COMPANY_SOURCE,
  type WorkbookCompanyEntry,
} from "@/lib/project-company-workbook-catalog";
import {
  normalizeCompanyNameKey,
  normalizeProjectCompanies,
  primaryDeveloperCompanyId,
  type ProjectCompanyAssociation,
  type ProjectCompanyProvenance,
} from "@/lib/project-operating-record";

export type WorkbookProjectCandidate = {
  id: string;
  name: string;
  reference: string | null;
  archivedAt: Date | string | null;
  createdBy?: string;
  companies: Array<Pick<ProjectCompanyAssociation, "companyId" | "role" | "isPrimary" | "provenance">>;
};

export type WorkbookCompanyDecisionAction =
  | "apply"
  | "already_linked"
  | "hold"
  | "person_review"
  | "conflict"
  | "skip"
  | "unresolved";

export type WorkbookCompanyDecision = {
  action: WorkbookCompanyDecisionAction;
  reason: string;
  entry: WorkbookCompanyEntry;
  project: WorkbookProjectCandidate | null;
  matchedProjectCount: number;
  companyName: string | null;
  resolvedCompanyId: string | null;
  existingPrimaryCompanyId: string | null;
  willCreateCompany: boolean;
  candidates: string[];
  sourceValue: string | null;
};

export function normalizeExactProjectNameKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function matchExactProjects<T extends { name: string }>(
  projects: T[],
  projectName: string,
): T[] {
  const key = normalizeExactProjectNameKey(projectName);
  if (!key) {
    return [];
  }
  return projects.filter((project) => normalizeExactProjectNameKey(project.name) === key);
}

export function billedLinkedProvenance(appliedAt: string): ProjectCompanyProvenance {
  return {
    method: "workbook_import",
    relationship: "billed_linked",
    source: WORKBOOK_COMPANY_SOURCE,
    appliedAt,
    notes: BILLED_LINKED_NOTE,
  };
}

export function attachBilledLinkedPrimary(
  existing: ProjectCompanyAssociation[],
  companyId: string,
  provenance: ProjectCompanyProvenance,
): ProjectCompanyAssociation[] {
  return normalizeProjectCompanies([
    { companyId, role: "developer", isPrimary: true, provenance },
    ...existing.filter((item) => !(item.companyId === companyId && item.role === "developer")),
  ]);
}

export function verifyBilledLinkedPrimary(
  associations: Array<Pick<ProjectCompanyAssociation, "companyId" | "role" | "isPrimary">>,
  companyId: string,
): boolean {
  return primaryDeveloperCompanyId(associations) === companyId;
}

export function decideWorkbookCompanyLink(input: {
  entry: WorkbookCompanyEntry;
  projects: WorkbookProjectCandidate[];
  resolvedCompanyId?: string | null;
  companyAlreadyExists?: boolean;
}): WorkbookCompanyDecision {
  const { entry, projects } = input;
  const matches = matchExactProjects(projects, entry.projectName);
  const activeMatches = matches.filter((project) => !project.archivedAt);
  const project = activeMatches[0] ?? null;
  const existingPrimaryCompanyId = project
    ? primaryDeveloperCompanyId(project.companies)
    : null;

  const base = {
    entry,
    project,
    matchedProjectCount: matches.length,
    companyName: entry.companyName ?? null,
    resolvedCompanyId: input.resolvedCompanyId ?? null,
    existingPrimaryCompanyId,
    willCreateCompany: false,
    candidates: entry.candidates ?? [],
    sourceValue: entry.sourceValue ?? null,
  };

  if (entry.kind === "no_project") {
    return {
      ...base,
      action: "unresolved",
      reason: "no_exact_project_match",
      project: null,
      existingPrimaryCompanyId: null,
    };
  }

  if (entry.kind === "person_review") {
    return {
      ...base,
      action: "person_review",
      reason: "source_is_individual",
    };
  }

  if (entry.kind === "hold") {
    return {
      ...base,
      action: "hold",
      reason: "multiple_company_candidates",
    };
  }

  if (matches.length === 0) {
    return {
      ...base,
      action: "unresolved",
      reason: "no_exact_project_match",
    };
  }

  if (matches.length > 1) {
    return {
      ...base,
      action: "conflict",
      reason: "ambiguous_project_name",
      project: null,
    };
  }

  if (!project) {
    return {
      ...base,
      action: "skip",
      reason: "only_archived_project_match",
    };
  }

  if (existingPrimaryCompanyId) {
    if (input.resolvedCompanyId && existingPrimaryCompanyId === input.resolvedCompanyId) {
      return {
        ...base,
        action: "already_linked",
        reason: "primary_company_already_matches",
      };
    }

    return {
      ...base,
      action: "conflict",
      reason: "existing_primary_company_preserved",
    };
  }

  return {
    ...base,
    action: "apply",
    reason: "exact_project_and_company",
    willCreateCompany: !input.companyAlreadyExists,
  };
}

export function confirmWorkbookWriteGuards(input: {
  activeExactMatches: number;
  latestPrimaryCompanyId: string | null;
  targetCompanyId: string | null;
}):
  | { proceed: true }
  | { proceed: false; action: "already_linked" | "conflict"; reason: string } {
  if (input.activeExactMatches !== 1) {
    return { proceed: false, action: "conflict", reason: "project_uniqueness_failed_before_write" };
  }

  if (input.latestPrimaryCompanyId) {
    if (input.targetCompanyId && input.latestPrimaryCompanyId === input.targetCompanyId) {
      return {
        proceed: false,
        action: "already_linked",
        reason: "primary_company_already_matches",
      };
    }
    return {
      proceed: false,
      action: "conflict",
      reason: "existing_primary_company_preserved",
    };
  }

  return { proceed: true };
}

export function decideWorkbookCompanyCatalog(
  projects: WorkbookProjectCandidate[],
  companiesByName: Map<string, string> = new Map(),
  catalog: WorkbookCompanyEntry[] = WORKBOOK_COMPANY_MAPPING,
): WorkbookCompanyDecision[] {
  return catalog.map((entry) => {
    const companyKey = entry.companyName ? normalizeCompanyNameKey(entry.companyName) : "";
    const resolvedCompanyId = companyKey ? companiesByName.get(companyKey) ?? null : null;
    return decideWorkbookCompanyLink({
      entry,
      projects,
      resolvedCompanyId,
      companyAlreadyExists: Boolean(resolvedCompanyId),
    });
  });
}
