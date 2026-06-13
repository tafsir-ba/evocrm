import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/require-auth", () => ({
  requireAuth: vi.fn(),
}));

vi.mock("@/server/workspaces/resolve-workspace", () => ({
  resolveWorkspace: vi.fn(),
}));

vi.mock("@/server/permissions/require-permission", () => ({
  requirePermission: vi.fn(),
}));

vi.mock("@/server/services/activities", () => ({
  listActivitiesForWorkspace: vi.fn(),
  createActivityForWorkspace: vi.fn(),
  getActivityForWorkspace: vi.fn(),
  updateActivityForWorkspace: vi.fn(),
  archiveActivityForWorkspace: vi.fn(),
  completeActivityForWorkspace: vi.fn(),
  cancelActivityForWorkspace: vi.fn(),
}));

import {
  GET as getActivities,
  POST as postActivity,
} from "@/app/api/workspaces/[workspaceSlug]/activities/route";
import {
  DELETE as deleteActivity,
  GET as getActivityById,
  PATCH as patchActivity,
} from "@/app/api/workspaces/[workspaceSlug]/activities/[activityId]/route";
import { PATCH as completeActivity } from "@/app/api/workspaces/[workspaceSlug]/activities/[activityId]/complete/route";
import { PATCH as cancelActivityRoute } from "@/app/api/workspaces/[workspaceSlug]/activities/[activityId]/cancel/route";
import { requireAuth } from "@/server/auth/require-auth";
import { requirePermission } from "@/server/permissions/require-permission";
import {
  archiveActivityForWorkspace,
  cancelActivityForWorkspace,
  completeActivityForWorkspace,
  createActivityForWorkspace,
  getActivityForWorkspace,
  listActivitiesForWorkspace,
  updateActivityForWorkspace,
} from "@/server/services/activities";
import { resolveWorkspace } from "@/server/workspaces/resolve-workspace";
import { AppError } from "@/server/errors";

const sampleActivity = {
  id: "507f1f77bcf86cd799439011",
  workspaceId: "507f1f77bcf86cd799439012",
  title: "Call lead",
  type: { id: "t1", label: "Call", color: "#000", key: "call" },
  status: { id: "s1", label: "Pending", color: "#888", key: "pending", behavior: "pending" },
  lead: { id: "lead-1", fullName: "Jane Doe", email: null },
  property: null,
  opportunity: null,
  assignedUser: null,
  isOverdue: false,
  isUpcoming: true,
};

function mockWorkspaceAccess(permission: string) {
  vi.mocked(requireAuth).mockResolvedValue({
    user: { id: "user-1", email: "a@b.com" },
  });
  vi.mocked(resolveWorkspace).mockResolvedValue({
    id: "ws-1",
    slug: "demo",
    name: "Demo",
    timezone: "UTC",
    defaultCurrency: "USD",
  });
  vi.mocked(requirePermission).mockResolvedValue({
    membership: {
      id: "m1",
      userId: "user-1",
      workspaceId: "ws-1",
      roleId: "role-1",
      status: "active",
      permissions: [permission],
    },
  });
}

describe("activity API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns UNAUTHENTICATED when not logged in", async () => {
    vi.mocked(requireAuth).mockRejectedValue(
      new AppError("UNAUTHENTICATED", "Authentication required."),
    );

    const response = await getActivities(
      new Request("http://localhost/api/workspaces/demo/activities"),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(401);
  });

  it("returns paginated activities for activity:read member", async () => {
    mockWorkspaceAccess("activity:read");
    vi.mocked(listActivitiesForWorkspace).mockResolvedValue({
      activities: [sampleActivity as never],
      total: 1,
    });

    const response = await getActivities(
      new Request("http://localhost/api/workspaces/demo/activities"),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(200);
    expect(requirePermission).toHaveBeenCalledWith("ws-1", "user-1", "activity:read");
    const body = await response.json();
    expect(body.data).toHaveLength(1);
  });

  it("creates activity with activity:create permission", async () => {
    mockWorkspaceAccess("activity:create");
    vi.mocked(createActivityForWorkspace).mockResolvedValue(sampleActivity as never);

    const response = await postActivity(
      new Request("http://localhost/api/workspaces/demo/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: "507f1f77bcf86cd799439013",
          typeId: "507f1f77bcf86cd799439014",
          statusId: "507f1f77bcf86cd799439015",
          title: "Call lead",
        }),
      }),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(201);
    expect(requirePermission).toHaveBeenCalledWith("ws-1", "user-1", "activity:create");
  });

  it("archives activity with activity:archive permission", async () => {
    mockWorkspaceAccess("activity:archive");
    vi.mocked(archiveActivityForWorkspace).mockResolvedValue(sampleActivity as never);

    const response = await deleteActivity(
      new Request("http://localhost/api/workspaces/demo/activities/act-1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ workspaceSlug: "demo", activityId: "act-1" }) },
    );

    expect(response.status).toBe(200);
    expect(archiveActivityForWorkspace).toHaveBeenCalledWith("ws-1", "act-1", "user-1");
  });

  it("completes activity via complete endpoint", async () => {
    mockWorkspaceAccess("activity:update");
    vi.mocked(completeActivityForWorkspace).mockResolvedValue({
      ...sampleActivity,
      status: { ...sampleActivity.status, behavior: "completed", label: "Completed" },
    } as never);

    const response = await completeActivity(
      new Request("http://localhost/api/workspaces/demo/activities/act-1/complete", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome: "Done" }),
      }),
      { params: Promise.resolve({ workspaceSlug: "demo", activityId: "act-1" }) },
    );

    expect(response.status).toBe(200);
    expect(completeActivityForWorkspace).toHaveBeenCalled();
  });

  it("cancels activity via cancel endpoint", async () => {
    mockWorkspaceAccess("activity:update");
    vi.mocked(cancelActivityForWorkspace).mockResolvedValue(sampleActivity as never);

    const response = await cancelActivityRoute(
      new Request("http://localhost/api/workspaces/demo/activities/act-1/cancel", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome: "No longer needed" }),
      }),
      { params: Promise.resolve({ workspaceSlug: "demo", activityId: "act-1" }) },
    );

    expect(response.status).toBe(200);
    expect(cancelActivityForWorkspace).toHaveBeenCalled();
  });

  it("gets activity detail with activity:read", async () => {
    mockWorkspaceAccess("activity:read");
    vi.mocked(getActivityForWorkspace).mockResolvedValue(sampleActivity as never);

    const response = await getActivityById(
      new Request("http://localhost/api/workspaces/demo/activities/act-1"),
      { params: Promise.resolve({ workspaceSlug: "demo", activityId: "act-1" }) },
    );

    expect(response.status).toBe(200);
    expect(getActivityForWorkspace).toHaveBeenCalledWith("ws-1", "act-1");
  });

  it("updates activity with activity:update", async () => {
    mockWorkspaceAccess("activity:update");
    vi.mocked(updateActivityForWorkspace).mockResolvedValue(sampleActivity as never);

    const response = await patchActivity(
      new Request("http://localhost/api/workspaces/demo/activities/act-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Updated title" }),
      }),
      { params: Promise.resolve({ workspaceSlug: "demo", activityId: "act-1" }) },
    );

    expect(response.status).toBe(200);
    expect(updateActivityForWorkspace).toHaveBeenCalled();
  });
});
