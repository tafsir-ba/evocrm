/**
 * CLI entry for project scope migration.
 *
 * Usage:
 *   npm run migrate:projects
 *   npm run migrate:projects -- --workspace-id=<id>
 *
 * Requires MONGODB_URI.
 */
import mongoose from "mongoose";

import {
  migrateAllWorkspacesProjectScope,
  migrateWorkspaceProjectScope,
} from "../server/services/project-migration";

async function main(): Promise<void> {
  const workspaceIdArg = process.argv.find((arg) => arg.startsWith("--workspace-id="));
  const workspaceId = workspaceIdArg?.split("=")[1]?.trim();

  const actorId = new mongoose.Types.ObjectId().toString();

  if (workspaceId) {
    const result = await migrateWorkspaceProjectScope(workspaceId, actorId);
    console.log("[migrate:projects] workspace complete", result);
    return;
  }

  const results = await migrateAllWorkspacesProjectScope(actorId);
  console.log("[migrate:projects] all workspaces complete", results);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error("[migrate:projects] failed", error);
    process.exit(1);
  });
