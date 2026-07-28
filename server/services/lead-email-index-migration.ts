import "server-only";

import { LeadModel } from "@/models/lead";
import { connectDb } from "@/server/db/mongoose";

export const LEGACY_LEAD_EMAIL_UNIQUE_INDEX = "workspaceId_1_emailNormalized_1";
export const PROJECT_SCOPED_LEAD_EMAIL_UNIQUE_INDEX =
  "workspaceId_1_projectId_1_emailNormalized_1";

export type LeadEmailIndexMigrationResult = {
  dryRun: boolean;
  legacyIndexPresent: boolean;
  legacyIndexDropped: boolean;
  targetIndexPresentBefore: boolean;
  targetIndexEnsured: boolean;
  indexesAfter: string[];
};

export async function migrateLeadEmailUniqueIndex(
  options: { dryRun?: boolean } = {},
): Promise<LeadEmailIndexMigrationResult> {
  const dryRun = options.dryRun ?? false;
  await connectDb();

  const collection = LeadModel.collection;
  const existing = await collection.indexes();
  const indexNames = existing.map((index) => index.name).filter(Boolean) as string[];

  const legacyIndexPresent = indexNames.includes(LEGACY_LEAD_EMAIL_UNIQUE_INDEX);
  const targetIndexPresentBefore = indexNames.includes(
    PROJECT_SCOPED_LEAD_EMAIL_UNIQUE_INDEX,
  );

  let legacyIndexDropped = false;
  let targetIndexEnsured = targetIndexPresentBefore;

  if (legacyIndexPresent) {
    if (!dryRun) {
      await collection.dropIndex(LEGACY_LEAD_EMAIL_UNIQUE_INDEX);
      legacyIndexDropped = true;
    }
  }

  if (!targetIndexPresentBefore && !dryRun) {
    await LeadModel.syncIndexes();
    targetIndexEnsured = true;
  }

  const indexesAfter = dryRun
    ? indexNames
    : ((await collection.indexes()).map((index) => index.name).filter(Boolean) as string[]);

  return {
    dryRun,
    legacyIndexPresent,
    legacyIndexDropped,
    targetIndexPresentBefore,
    targetIndexEnsured: dryRun ? targetIndexPresentBefore : targetIndexEnsured,
    indexesAfter,
  };
}
