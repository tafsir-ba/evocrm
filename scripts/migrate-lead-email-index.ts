/**
 * Migrates lead email uniqueness from workspace-scoped to project-scoped.
 *
 * Drops legacy partial unique index:
 *   workspaceId_1_emailNormalized_1
 * Ensures project-scoped partial unique index:
 *   workspaceId_1_projectId_1_emailNormalized_1
 *
 * Usage:
 *   npm run migrate:lead-email-index
 *   npm run migrate:lead-email-index -- --dry-run
 *
 * Requires MONGODB_URI.
 */
import mongoose from "mongoose";

import { migrateLeadEmailUniqueIndex } from "../server/services/lead-email-index-migration";

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const result = await migrateLeadEmailUniqueIndex({ dryRun });
  console.log("[migrate:lead-email-index] complete", result);
}

main()
  .then(async () => {
    await mongoose.disconnect().catch(() => undefined);
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    console.error("[migrate:lead-email-index] failed", error);
    await mongoose.disconnect().catch(() => undefined);
    process.exit(1);
  });
