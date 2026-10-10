import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/server/observability/capture-error", () => ({
  captureError: vi.fn(),
}));

vi.mock("@/server/repositories/leads", () => ({
  findLeadById: vi.fn(),
}));

vi.mock("@/server/repositories/projects", () => ({
  findProjectById: vi.fn(),
}));

vi.mock("@/server/services/lead-enrichment", () => ({
  getLeadEnrichmentCapability: vi.fn(),
  startLeadEnrichment: vi.fn(),
}));

import { createAuditLog } from "@/server/audit/create-audit-log";
import { findLeadById } from "@/server/repositories/leads";
import { findProjectById } from "@/server/repositories/projects";
import {
  evaluateLeadAutoEnrichmentForLead,
} from "@/server/services/lead-auto-enrichment";
import {
  getLeadEnrichmentCapability,
  startLeadEnrichment,
} from "@/server/services/lead-enrichment";
import { projectRecordExtras } from "@/tests/helpers/crm-fixtures";

describe("lead auto enrichment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts enrichment when the project flag is on and capability is enabled", async () => {
    vi.mocked(findLeadById).mockResolvedValue({
      id: "lead-1",
      workspaceId: "ws-1",
      projectId: "project-1",
      fullName: "Alice Example",
      email: "alice@example.com",
      archivedAt: null,
    } as never);
    vi.mocked(findProjectById).mockResolvedValue({
      id: "project-1",
      ...projectRecordExtras,
      autoEnrichLeads: true,
      archivedAt: null,
    } as never);
    vi.mocked(getLeadEnrichmentCapability).mockResolvedValue({
      enabled: true,
      reasonDisabled: null,
    } as never);
    vi.mocked(startLeadEnrichment).mockResolvedValue({
      id: "run-1",
      status: "applied",
    } as never);

    await evaluateLeadAutoEnrichmentForLead({
      workspaceId: "ws-1",
      leadId: "lead-1",
      actorId: "user-1",
    });

    expect(startLeadEnrichment).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      leadId: "lead-1",
      actorId: "user-1",
    });
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "lead.auto_enrichment_started",
      }),
    );
  });

  it("skips when the project auto-enrich setting is off", async () => {
    vi.mocked(findLeadById).mockResolvedValue({
      id: "lead-1",
      workspaceId: "ws-1",
      projectId: "project-1",
      fullName: "Alice Example",
      email: "alice@example.com",
      archivedAt: null,
    } as never);
    vi.mocked(findProjectById).mockResolvedValue({
      id: "project-1",
      ...projectRecordExtras,
      autoEnrichLeads: false,
      archivedAt: null,
    } as never);

    await evaluateLeadAutoEnrichmentForLead({
      workspaceId: "ws-1",
      leadId: "lead-1",
      actorId: "user-1",
    });

    expect(startLeadEnrichment).not.toHaveBeenCalled();
  });
});
