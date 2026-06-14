import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/audit-logs", () => ({
  createAuditLogRecord: vi.fn(),
}));

vi.mock("@/server/observability/capture-error", () => ({
  captureError: vi.fn(),
}));

import { createAuditLogRecord } from "@/server/repositories/audit-logs";
import { createAuditLog } from "@/server/audit/create-audit-log";
import { captureError } from "@/server/observability/capture-error";

describe("createAuditLog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists sanitized audit payload", async () => {
    vi.mocked(createAuditLogRecord).mockResolvedValue({
      id: "audit-1",
      workspaceId: "ws-1",
      actorId: "user-1",
      action: "lead.created",
      entityType: "lead",
      entityId: "lead-1",
      before: null,
      after: { apiKeyHash: "[redacted]" },
      createdAt: new Date(),
    });

    await createAuditLog({
      workspaceId: "ws-1",
      actorId: "user-1",
      action: "lead.created",
      entityType: "lead",
      entityId: "lead-1",
      after: { apiKeyHash: "raw-hash" },
    });

    expect(createAuditLogRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        after: { apiKeyHash: "[redacted]" },
      }),
    );
  });

  it("does not throw when persistence fails", async () => {
    vi.mocked(createAuditLogRecord).mockRejectedValue(new Error("db down"));

    await expect(
      createAuditLog({
        workspaceId: "ws-1",
        actorId: "user-1",
        action: "lead.created",
        entityType: "lead",
        entityId: "lead-1",
      }),
    ).resolves.toBeUndefined();

    expect(captureError).toHaveBeenCalled();
  });
});
