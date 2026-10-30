/**
 * Seed lead status history + replay audit transitions for funnel conversion.
 *
 * Usage:
 *   npx tsx scripts/backfill-lead-status-history.ts --workspace <id> --project <id>
 *   npx tsx scripts/backfill-lead-status-history.ts --workspace <id>   # all projects
 */
import { connectDb } from "../server/db/mongoose";
import { findProjects } from "../server/repositories/projects";
import { findWorkspaceById } from "../server/repositories/workspaces";
import { backfillLeadStatusHistoryForProject } from "../server/services/lead-status-history";

function readArg(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index < 0) return null;
  return process.argv[index + 1] ?? null;
}

async function main() {
  const workspaceId = readArg("--workspace");
  const projectId = readArg("--project");
  if (!workspaceId) {
    console.error("Required: --workspace <workspaceId>");
    process.exit(1);
  }

  await connectDb();
  const workspace = await findWorkspaceById(workspaceId);
  if (!workspace) {
    console.error("Workspace not found.");
    process.exit(1);
  }

  const projects = projectId
    ? [{ id: projectId }]
    : await findProjects(workspaceId, { includeArchived: false });

  let seeded = 0;
  let fromAudits = 0;
  for (const project of projects) {
    const result = await backfillLeadStatusHistoryForProject({
      workspaceId,
      projectId: project.id,
    });
    seeded += result.seeded;
    fromAudits += result.fromAudits;
    console.log(
      `project ${project.id}: seeded=${result.seeded} audits=${result.fromAudits}`,
    );
  }

  console.log(`done: seeded=${seeded} fromAudits=${fromAudits}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
