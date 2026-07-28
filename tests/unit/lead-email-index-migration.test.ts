import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/mongoose", () => ({
  connectDb: vi.fn(),
}));

vi.mock("@/models/lead", () => ({
  LeadModel: {
    collection: {
      indexes: vi.fn(),
      dropIndex: vi.fn(),
    },
    syncIndexes: vi.fn(),
  },
}));

import { LeadModel } from "@/models/lead";
import {
  LEGACY_LEAD_EMAIL_UNIQUE_INDEX,
  PROJECT_SCOPED_LEAD_EMAIL_UNIQUE_INDEX,
  migrateLeadEmailUniqueIndex,
} from "@/server/services/lead-email-index-migration";

describe("lead email index migration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("drops legacy index and syncs when target is missing", async () => {
    vi.mocked(LeadModel.collection.indexes)
      .mockResolvedValueOnce([{ name: LEGACY_LEAD_EMAIL_UNIQUE_INDEX }] as never)
      .mockResolvedValueOnce([
        { name: PROJECT_SCOPED_LEAD_EMAIL_UNIQUE_INDEX },
      ] as never);

    const result = await migrateLeadEmailUniqueIndex({ dryRun: false });

    expect(LeadModel.collection.dropIndex).toHaveBeenCalledWith(LEGACY_LEAD_EMAIL_UNIQUE_INDEX);
    expect(LeadModel.syncIndexes).toHaveBeenCalled();
    expect(result.legacyIndexDropped).toBe(true);
    expect(result.targetIndexEnsured).toBe(true);
  });

  it("does not mutate indexes in dry-run mode", async () => {
    vi.mocked(LeadModel.collection.indexes).mockResolvedValue([
      { name: LEGACY_LEAD_EMAIL_UNIQUE_INDEX },
    ] as never);

    const result = await migrateLeadEmailUniqueIndex({ dryRun: true });

    expect(LeadModel.collection.dropIndex).not.toHaveBeenCalled();
    expect(LeadModel.syncIndexes).not.toHaveBeenCalled();
    expect(result.dryRun).toBe(true);
    expect(result.legacyIndexPresent).toBe(true);
    expect(result.legacyIndexDropped).toBe(false);
  });
});
