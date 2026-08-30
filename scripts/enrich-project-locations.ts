/**
 * Evidence-backed project location enrichment.
 *
 * Usage:
 *   npm run enrich:project-locations
 *   npm run enrich:project-locations -- --workspace-id=<id>
 *   npm run enrich:project-locations -- --execute --confirm-write
 *   npm run enrich:project-locations -- --write-report
 *
 * Dry-run by default. Never invents locations. High-confidence catalog
 * matches and unique verified place signals only. User-confirmed rows
 * keep provenance.method = user_confirmed (operator-provided, not inferred).
 *
 * Research convention before marking a record unresolved:
 *   Swiss:     "[project name] promotion" (+ municipality/canton if known)
 *   Overseas:  "[project name] development"
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

const REPORT_DIR = "migrations/project-locations";

async function main(): Promise<void> {
  bootstrapEnv();
  const options = parseArgs(process.argv.slice(2));
  const liveWrite = options.execute && options.confirmWrite;

  if (options.execute && !options.confirmWrite) {
    throw new Error("Refusing to write: pass --confirm-write with --execute.");
  }

  const { catalogCoverageSummary } = await import("../lib/project-location-catalog");
  const {
    decideProjectLocationEnrichment,
    describeUnresolvedDecision,
  } = await import("../lib/project-location-enrichment");
  const { findAllWorkspaces, findWorkspaceById } = await import(
    "../server/repositories/workspaces"
  );
  const { findProjects, updateProject } = await import(
    "../server/repositories/projects"
  );

  const coverage = catalogCoverageSummary();
  const workspaces = options.workspaceId
    ? [await findWorkspaceById(options.workspaceId)]
    : await findAllWorkspaces();

  const resolved = workspaces.filter((workspace): workspace is NonNullable<typeof workspace> =>
    Boolean(workspace),
  );

  if (options.workspaceId && resolved.length === 0) {
    throw new Error(`Workspace not found: ${options.workspaceId}`);
  }

  const results: Array<Record<string, unknown>> = [];
  const unresolvedCompact: Array<Record<string, unknown>> = [];
  let applied = 0;
  let skipped = 0;
  let review = 0;

  for (const workspace of resolved) {
    const projects = await findProjects(workspace.id, { includeArchived: true });
    for (const project of projects) {
      const decision = decideProjectLocationEnrichment(project);
      const row = {
        workspaceId: workspace.id,
        projectId: project.id,
        name: project.name,
        reference: project.reference,
        action: decision.action,
        reason: decision.reason,
        catalogKey: decision.location.provenance?.catalogKey ?? null,
        countryCode: decision.location.countryCode,
        municipality: decision.location.municipality,
        overwrittenManual: decision.overwrittenManual,
      };
      results.push(row);
      const unresolvedItem = describeUnresolvedDecision(project, decision);
      if (unresolvedItem) {
        unresolvedCompact.push(unresolvedItem);
      }

      if (decision.action === "apply") {
        applied += 1;
        if (liveWrite) {
          await updateProject(workspace.id, project.id, {
            location: decision.location,
            city: decision.city,
            country: decision.country,
          });
        }
      } else if (decision.action === "review") {
        review += 1;
        if (liveWrite) {
          await updateProject(workspace.id, project.id, {
            location: decision.location,
          });
        }
      } else {
        skipped += 1;
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: liveWrite ? "execute" : "dry-run",
    catalog: coverage,
    workspaces: resolved.length,
    projects: results.length,
    applied,
    skipped,
    unresolved: review + results.filter((row) => row.reason === "no_match").length,
    review,
    unresolvedCompact,
    results,
  };

  console.log(JSON.stringify(report, null, 2));

  if (options.writeReport) {
    await mkdir(REPORT_DIR, { recursive: true });
    const file = path.join(REPORT_DIR, "last-run-report.json");
    const unresolvedFile = path.join(REPORT_DIR, "unresolved-list.json");
    await writeFile(file, `${JSON.stringify(report, null, 2)}\n`);
    await writeFile(
      unresolvedFile,
      `${JSON.stringify(
        {
          generatedAt: report.generatedAt,
          mode: report.mode,
          policy:
            "Place names in the project title are candidates. Official maps or project sites must verify them. Swiss records were searched as “[name] promotion” and overseas as “[name] development” before remaining here. This list is only genuine ambiguities and names with no verifiable place signal.",
          items: unresolvedCompact,
        },
        null,
        2,
      )}\n`,
    );
    console.error(`[enrich:project-locations] wrote ${file}`);
    console.error(`[enrich:project-locations] wrote ${unresolvedFile}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error("[enrich:project-locations] failed", error);
    process.exit(1);
  });
