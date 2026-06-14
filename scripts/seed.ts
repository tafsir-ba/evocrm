/**
 * CLI entry for demo workspace seeding.
 *
 * Usage:
 *   npm run seed
 *   npm run seed -- --dry-run
 *
 * Requires MONGODB_URI. Optional SEED_DEMO_PASSWORD overrides demo user password.
 */
import { runSeed } from "../server/seed/index";

const dryRun = process.argv.includes("--dry-run");

runSeed({ dryRun })
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error("[seed] failed", error);
    process.exit(1);
  });
