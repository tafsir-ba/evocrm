/**
 * Backfill native lead↔project memberships from Lead.projectId.
 * Idempotent. Does not apply HubSpot held multi-project associations.
 * Does not enroll campaigns or drips.
 *
 * Usage:
 *   npm run migrate:lead-project-memberships
 *   npm run migrate:lead-project-memberships -- --dry-run
 *   npm run migrate:lead-project-memberships -- --workspace-id=<id> --actor-id=<userId>
 *
 * Requires MONGODB_URI.
 */
import mongoose from "mongoose";

import { backfillLeadProjectMemberships } from "../server/services/lead-project-membership-backfill";

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() || undefined : undefined;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const workspaceId = readArg("workspace-id");
  const actorId = readArg("actor-id") ?? "000000000000000000000001";
  const result = await backfillLeadProjectMemberships({
    workspaceId,
    actorId,
    dryRun,
  });
  console.log("[migrate:lead-project-memberships] complete", result);
}

main()
  .then(async () => {
    await mongoose.disconnect().catch(() => undefined);
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    console.error("[migrate:lead-project-memberships] failed", error);
    await mongoose.disconnect().catch(() => undefined);
    process.exit(1);
  });
