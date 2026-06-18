import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/services/leads", () => ({
  createLeadForWorkspace: vi.fn(),
}));

import { leadImportConfig } from "@/server/imports/entities/lead-import-config";
import { createLeadForWorkspace } from "@/server/services/leads";

describe("lead import automation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createLeadForWorkspace).mockResolvedValue({
      lead: {
        id: "lead-1",
      },
      warnings: [],
    } as never);
  });

  it("does not trigger new_lead campaign automation during import", async () => {
    await leadImportConfig.createRecord(
      {
        projectId: "project-1",
        statusId: "status-1",
        firstName: "John",
        lastName: "Smith",
        email: "john@example.com",
      },
      {
        workspaceId: "ws-1",
        actorId: "user-1",
        defaultCurrency: "CHF",
        dictionaryLookup: new Map(),
        projectLookup: new Map(),
        memberLookup: new Map(),
        tagLookup: new Map(),
      },
    );

    expect(createLeadForWorkspace).toHaveBeenCalledWith(
      "ws-1",
      "user-1",
      expect.objectContaining({
        firstName: "John",
        lastName: "Smith",
      }),
      { triggerAutomation: false },
    );
  });
});
