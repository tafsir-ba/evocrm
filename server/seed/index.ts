import "server-only";

/**
 * Seed / demo data scaffold.
 *
 * Future phases will add:
 * - demo workspace and memberships
 * - dictionary seeds (statuses, sources, types)
 * - sample leads/properties for E2E
 *
 * Do not add V1 product seed data in Phase 0.
 */

export type SeedOptions = {
  dryRun?: boolean;
};

export async function runSeed(_options: SeedOptions = {}): Promise<void> {
  // Reserved for Phase 2+ demo and test fixtures.
  return Promise.resolve();
}
