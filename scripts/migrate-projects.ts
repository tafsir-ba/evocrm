/**
 * CLI entry for project scope migration.
 *
 * Usage:
 *   npm run migrate:projects
 *   npm run migrate:projects -- --workspace-id=<id>
 *   npm run migrate:projects -- --workspace-id=<id> --actor-id=<userId>
 *
 * Actor resolution:
 *   - `--actor-id` when provided (used for default project createdBy)
 *   - otherwise workspace `createdBy` for single-workspace runs
 *   - all-workspace runs use each workspace's `createdBy`
 *
 * Requires MONGODB_URI.
 */
import {
  migrateAllWorkspacesProjectScope,
  migrateWorkspaceProjectScope,
} from "../server/services/project-migration";
import { findWorkspaceById } from "../server/repositories/workspaces";

async function resolveActorId(workspaceId: string): Promise<string> {
  const actorIdArg = process.argv
    .find((arg) => arg.startsWith("--actor-id="))
    ?.split("=")[1]
    ?.trim();

  if (actorIdArg) {
    return actorIdArg;
  }

  const workspace = await findWorkspaceById(workspaceId);

  if (workspace?.createdBy) {
    return workspace.createdBy;
  }

  throw new Error(
    "Actor ID required. Pass --actor-id=<userId> or ensure the workspace has a createdBy user.",
  );
}

async function main(): Promise<void> {
  const workspaceIdArg = process.argv.find((arg) => arg.startsWith("--workspace-id="));
  const workspaceId = workspaceIdArg?.split("=")[1]?.trim();

  if (workspaceId) {
    const actorId = await resolveActorId(workspaceId);
    const result = await migrateWorkspaceProjectScope(workspaceId, actorId);
    console.log("[migrate:projects] workspace complete", result);
    return;
  }

  const results = await migrateAllWorkspacesProjectScope();
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
