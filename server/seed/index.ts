import "server-only";

/**
 * Seed / demo data scaffold.
 *
 * Future phases will add:
 * - demo workspace and memberships
 * - sample leads/properties for E2E
 *
 * Default dictionaries are seeded via ensureDefaultDictionaries() in
 * /server/services/default-dictionaries.ts (workspace creation + context load).
 */

export type SeedOptions = {
  dryRun?: boolean;
};

export async function runSeed(_options: SeedOptions = {}): Promise<void> {
  // Reserved for Phase 2+ demo and test fixtures.
  return Promise.resolve();
}
