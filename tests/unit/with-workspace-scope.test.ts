import { describe, expect, it } from "vitest";

import { withWorkspaceScope } from "@/server/workspaces/with-workspace-scope";

describe("withWorkspaceScope", () => {
  it("merges server-resolved workspaceId into filter", () => {
    const scoped = withWorkspaceScope("ws_server_123", {
      _id: "lead_456",
    });

    expect(scoped).toEqual({
      _id: "lead_456",
      workspaceId: "ws_server_123",
    });
  });

  it("overwrites any client-provided workspaceId in filter", () => {
    const scoped = withWorkspaceScope("ws_server_123", {
      _id: "lead_456",
      workspaceId: "ws_client_untrusted",
    });

    expect(scoped.workspaceId).toBe("ws_server_123");
  });

  it("preserves additional filter fields", () => {
    const scoped = withWorkspaceScope("ws_1", {
      archivedAt: null,
      statusId: "status_1",
    });

    expect(scoped).toEqual({
      archivedAt: null,
      statusId: "status_1",
      workspaceId: "ws_1",
    });
  });
});
