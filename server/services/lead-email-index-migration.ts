import "server-only";

import {
  LEAD_IDEMPOTENCY_UNIQUE_INDEX,
  LEGACY_LEAD_EMAIL_UNIQUE_INDEX,
  PROJECT_SCOPED_LEAD_EMAIL_UNIQUE_INDEX,
} from "@/lib/lead-duplicate-reconciliation";
import { ensureLeadUniqueIndexes } from "@/server/services/lead-duplicate-reconciliation";

export {
  LEAD_IDEMPOTENCY_UNIQUE_INDEX,
  LEGACY_LEAD_EMAIL_UNIQUE_INDEX,
  PROJECT_SCOPED_LEAD_EMAIL_UNIQUE_INDEX,
};

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
  const result = await ensureLeadUniqueIndexes({ dryRun });
  const before = result.indexesAfter;

  return {
    dryRun,
    legacyIndexPresent: before.includes(LEGACY_LEAD_EMAIL_UNIQUE_INDEX) && !result.legacyIndexDropped,
    legacyIndexDropped: result.legacyIndexDropped,
    targetIndexPresentBefore: before.includes(PROJECT_SCOPED_LEAD_EMAIL_UNIQUE_INDEX),
    targetIndexEnsured: result.emailIndexEnsured && result.idempotencyIndexEnsured,
    indexesAfter: result.indexesAfter,
  };
}
