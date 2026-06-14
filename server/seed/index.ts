import "server-only";

import { seedDemoWorkspace } from "@/server/seed/demo-workspace";

/**
 * Seed / demo data entry point.
 *
 * Creates (idempotently):
 * - demo credentials user (demo@evocrm.local)
 * - demo workspace (demo-agency slug)
 * - sample leads, properties, opportunities, activities, campaign, integration
 *
 * Default dictionaries and roles are created via workspace creation.
 */

export type SeedOptions = {
  dryRun?: boolean;
  password?: string;
};

export { DEMO_USER_EMAIL, DEMO_WORKSPACE_SLUG } from "@/server/seed/demo-workspace";

export async function runSeed(options: SeedOptions = {}): Promise<void> {
  const result = await seedDemoWorkspace({
    dryRun: options.dryRun,
    password: options.password,
  });

  console.info(
    `[seed] workspace=${result.workspaceSlug} created=${result.created} userId=${result.userId}`,
  );
}
