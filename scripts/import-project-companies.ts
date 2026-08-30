/**
 * Approved workbook-derived project ↔ company links.
 *
 * Usage:
 *   npm run import:project-companies
 *   npm run import:project-companies -- --workspace-id=<id>
 *   npm run import:project-companies -- --execute --confirm-write
 *   npm run import:project-companies -- --write-report
 *
 * Dry-run by default. Exact project names and exact/deduplicated company
 * names only. Billed/linked relationship — does not claim legal ownership.
 * Never overwrites an existing primary company. Never creates a Company
 * from an individual name. Never creates a project.
 *
 * Requires MONGODB_URI for live apply.
 */
import Module from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const loadable = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = loadable._load.bind(Module);
loadable._load = function patchedLoad(
  request: string,
  parent: unknown,
  isMain: boolean,
) {
  if (request === "server-only") {
    return {};
  }
  return originalLoad(request, parent, isMain);
};

function withDefaultDb(uri: string): string {
  try {
    const parsed = new URL(uri);
    if (!parsed.pathname || parsed.pathname === "/") {
      parsed.pathname = "/evocrm";
      return parsed.toString();
    }
  } catch {
    return uri;
  }
  return uri;
}

function bootstrapEnv(): void {
  if (!process.env.MONGODB_URI && process.env.MONGO_URL) {
    process.env.MONGODB_URI = withDefaultDb(process.env.MONGO_URL);
  } else if (process.env.MONGODB_URI) {
    process.env.MONGODB_URI = withDefaultDb(process.env.MONGODB_URI);
  }
  if (!process.env.NEXT_PUBLIC_APP_URL) {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  }
  if (!process.env.NODE_ENV || process.env.NODE_ENV === "production") {
    Object.assign(process.env, { NODE_ENV: "development" });
  }
}

type CliOptions = {
  workspaceId: string | null;
  execute: boolean;
  confirmWrite: boolean;
  writeReport: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  const workspaceId =
    argv.find((arg) => arg.startsWith("--workspace-id="))?.split("=")[1]?.trim() ??
    null;
  return {
    workspaceId: workspaceId || null,
    execute: argv.includes("--execute"),
    confirmWrite: argv.includes("--confirm-write"),
    writeReport: argv.includes("--write-report"),
  };
}

const REPORT_DIR = "migrations/project-companies";

async function main(): Promise<void> {
  bootstrapEnv();
  const options = parseArgs(process.argv.slice(2));
  const liveWrite = options.execute && options.confirmWrite;

  if (options.execute && !options.confirmWrite) {
    throw new Error("Refusing to write: pass --confirm-write with --execute.");
  }

  const { workbookCompanyCatalogSummary } = await import(
    "../lib/project-company-workbook-catalog"
  );
  const {
    attachBilledLinkedPrimary,
    billedLinkedProvenance,
    confirmWorkbookWriteGuards,
    decideWorkbookCompanyLink,
    matchExactProjects,
    verifyBilledLinkedPrimary,
  } = await import("../lib/project-company-workbook");
  const { normalizeCompanyNameKey } = await import("../lib/project-operating-record");
  const { createAuditLog } = await import("../server/audit/create-audit-log");
  const { createCompanyForWorkspace } = await import("../server/services/companies");
  const { findActiveCompanyByNormalizedName } = await import(
    "../server/repositories/companies"
  );
  const { findAllWorkspaces, findWorkspaceById } = await import(
    "../server/repositories/workspaces"
  );
  const { findProjectById, findProjects, updateProject } = await import(
    "../server/repositories/projects"
  );
  const { WORKBOOK_COMPANY_MAPPING } = await import(
    "../lib/project-company-workbook-catalog"
  );

  const workspaces = options.workspaceId
    ? [await findWorkspaceById(options.workspaceId)]
    : await findAllWorkspaces();

  const resolved = workspaces.filter((workspace): workspace is NonNullable<typeof workspace> =>
    Boolean(workspace),
  );

  if (options.workspaceId && resolved.length === 0) {
    throw new Error(`Workspace not found: ${options.workspaceId}`);
  }

  const appliedAt = new Date().toISOString();
  const results: Array<Record<string, unknown>> = [];
  let applied = 0;
  let alreadyLinked = 0;
  let held = 0;
  let conflicts = 0;
  let skipped = 0;
  let unresolved = 0;
  let companiesCreated = 0;

  for (const workspace of resolved) {
    const projects = await findProjects(workspace.id, { includeArchived: true });

    for (const entry of WORKBOOK_COMPANY_MAPPING) {
      const companyKey = entry.companyName ? normalizeCompanyNameKey(entry.companyName) : "";
      const existingCompany = companyKey
        ? await findActiveCompanyByNormalizedName(workspace.id, companyKey)
        : null;

      let decision = decideWorkbookCompanyLink({
        entry,
        projects,
        resolvedCompanyId: existingCompany?.id ?? null,
        companyAlreadyExists: Boolean(existingCompany),
      });

      let wrote = false;
      let verified = false;
      let companyId = existingCompany?.id ?? null;
      let companyCreated = false;

      if (liveWrite && decision.action === "apply" && decision.project && entry.companyName) {
        const matches = matchExactProjects(projects, entry.projectName).filter(
          (project) => !project.archivedAt,
        );
        const preWrite = await findProjectById(workspace.id, decision.project.id);
        const latestPrimary = preWrite
          ? preWrite.companies.find((item) => item.role === "developer" && item.isPrimary)
              ?.companyId ?? null
          : null;
        const guard = confirmWorkbookWriteGuards({
          activeExactMatches: matches.length,
          latestPrimaryCompanyId: latestPrimary,
          targetCompanyId: existingCompany?.id ?? null,
        });
        if (!guard.proceed) {
          decision = {
            ...decision,
            action: guard.action,
            reason: guard.reason,
            existingPrimaryCompanyId: latestPrimary,
          };
        } else {
            const ensured = await createCompanyForWorkspace(
              workspace.id,
              decision.project.createdBy ?? workspace.createdBy,
              { name: entry.companyName },
            );
            companyCreated = ensured.created;
            companyId = ensured.company.id;

            const uniqueCompany = await findActiveCompanyByNormalizedName(workspace.id, companyKey);
            if (!uniqueCompany || uniqueCompany.id !== companyId) {
              decision = {
                ...decision,
                action: "conflict",
                reason: "company_uniqueness_failed_before_write",
                resolvedCompanyId: uniqueCompany?.id ?? companyId,
              };
            } else {
              const nextCompanies = attachBilledLinkedPrimary(
                preWrite?.companies ?? decision.project.companies,
                companyId,
                billedLinkedProvenance(appliedAt),
              );
              const updated = await updateProject(workspace.id, decision.project.id, {
                companies: nextCompanies,
              });
              wrote = Boolean(updated);
              const verifiedProject = await findProjectById(workspace.id, decision.project.id);
              verified = Boolean(
                verifiedProject && verifyBilledLinkedPrimary(verifiedProject.companies, companyId),
              );
              if (!verified) {
                decision = {
                  ...decision,
                  action: "conflict",
                  reason: "post_write_verification_failed",
                  resolvedCompanyId: companyId,
                };
              } else {
                await createAuditLog({
                  workspaceId: workspace.id,
                  actorId: decision.project.createdBy ?? workspace.createdBy,
                  action: "project.updated",
                  entityType: "project",
                  entityId: decision.project.id,
                  after: {
                    companies: verifiedProject?.companies,
                    workbookCompanyImport: {
                      relationship: "billed_linked",
                      companyId,
                      companyName: entry.companyName,
                      claimsLegalOwnership: false,
                    },
                  },
                });
              }
            }
        }
      }

      if (decision.action === "apply") {
        applied += 1;
        if (companyCreated) {
          companiesCreated += 1;
        }
      } else if (decision.action === "already_linked") {
        alreadyLinked += 1;
      } else if (decision.action === "hold" || decision.action === "person_review") {
        held += 1;
      } else if (decision.action === "conflict") {
        conflicts += 1;
      } else if (decision.action === "skip") {
        skipped += 1;
      } else {
        unresolved += 1;
      }

      results.push({
        workspaceId: workspace.id,
        catalogKey: entry.key,
        projectName: entry.projectName,
        projectId: decision.project?.id ?? null,
        reference: decision.project?.reference ?? null,
        action: decision.action,
        reason: decision.reason,
        companyName: decision.companyName,
        companyId,
        companyCreated,
        existingPrimaryCompanyId: decision.existingPrimaryCompanyId,
        candidates: decision.candidates,
        sourceValue: decision.sourceValue,
        wrote,
        verified,
        relationship: "billed_linked",
        claimsLegalOwnership: false,
        note: entry.note,
      });
    }
  }

  const report = {
    generatedAt: appliedAt,
    mode: liveWrite ? "execute" : "dry-run",
    policy: {
      matching: "exact project name and exact/deduplicated company name only",
      relationship: "billed_linked",
      claimsLegalOwnership: false,
      createProjects: false,
      createCompanyFromIndividuals: false,
      overwriteExistingPrimary: false,
    },
    catalog: workbookCompanyCatalogSummary(),
    workspaces: resolved.length,
    rows: results.length,
    applied,
    alreadyLinked,
    held,
    conflicts,
    skipped,
    unresolved,
    companiesCreated,
    results,
  };

  console.log(JSON.stringify(report, null, 2));

  if (options.writeReport) {
    await mkdir(REPORT_DIR, { recursive: true });
    const file = path.join(REPORT_DIR, "last-run-report.json");
    const holdsFile = path.join(REPORT_DIR, "holds-and-conflicts.json");
    await writeFile(file, `${JSON.stringify(report, null, 2)}\n`);
    await writeFile(
      holdsFile,
      `${JSON.stringify(
        {
          generatedAt: report.generatedAt,
          mode: report.mode,
          policy: report.policy,
          items: results.filter((row) =>
            ["hold", "person_review", "conflict", "unresolved"].includes(String(row.action)),
          ),
        },
        null,
        2,
      )}\n`,
    );
    console.error(`[import:project-companies] wrote ${file}`);
    console.error(`[import:project-companies] wrote ${holdsFile}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error("[import:project-companies] failed", error);
    process.exit(1);
  });
