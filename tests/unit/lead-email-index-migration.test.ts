import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/services/lead-duplicate-reconciliation", () => ({
  ensureLeadUniqueIndexes: vi.fn(),
}));

import { ensureLeadUniqueIndexes } from "@/server/services/lead-duplicate-reconciliation";
import {
  PROJECT_SCOPED_LEAD_EMAIL_UNIQUE_INDEX,
  migrateLeadEmailUniqueIndex,
} from "@/server/services/lead-email-index-migration";

describe("lead email index migration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates to unique-index ensure after duplicate reconciliation", async () => {
    vi.mocked(ensureLeadUniqueIndexes).mockResolvedValue({
      dryRun: false,
      legacyIndexDropped: true,
      emailIndexEnsured: true,
      idempotencyIndexEnsured: true,
      indexesAfter: [PROJECT_SCOPED_LEAD_EMAIL_UNIQUE_INDEX],
    });

    const result = await migrateLeadEmailUniqueIndex({ dryRun: false });

    expect(ensureLeadUniqueIndexes).toHaveBeenCalledWith({ dryRun: false });
    expect(result.legacyIndexDropped).toBe(true);
    expect(result.targetIndexEnsured).toBe(true);
  });

  it("does not claim indexes were created in dry-run", async () => {
    vi.mocked(ensureLeadUniqueIndexes).mockResolvedValue({
      dryRun: true,
      legacyIndexDropped: false,
      emailIndexEnsured: false,
      idempotencyIndexEnsured: false,
      indexesAfter: [],
    });

    const result = await migrateLeadEmailUniqueIndex({ dryRun: true });

    expect(ensureLeadUniqueIndexes).toHaveBeenCalledWith({ dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.legacyIndexDropped).toBe(false);
    expect(result.targetIndexEnsured).toBe(false);
  });
});
