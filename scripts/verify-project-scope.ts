/**
 * Verifies CRM records have projectId after migration.
 *
 * Usage:
 *   npm run verify:projects
 *   npm run verify:projects -- --workspace-id=<id>
 *
 * Exits 0 when all checked workspaces have zero missing projectId records.
 * Requires MONGODB_URI.
 */
import { verifyProjectScopeMigration } from "../server/services/project-migration";

async function main(): Promise<void> {
  const workspaceIdArg = process.argv.find((arg) => arg.startsWith("--workspace-id="));
  const workspaceId = workspaceIdArg?.split("=")[1]?.trim();

  const results = await verifyProjectScopeMigration(workspaceId);

  for (const result of results) {
    console.log("[verify:projects]", JSON.stringify(result));
  }

  const allOk = results.every((result) => result.ok);

  if (!allOk) {
    console.error("[verify:projects] FAILED — records missing projectId remain.");
    process.exit(1);
  }

  console.log("[verify:projects] OK — no records missing projectId.");
}

main().catch((error: unknown) => {
  console.error("[verify:projects] failed", error);
  process.exit(1);
});
