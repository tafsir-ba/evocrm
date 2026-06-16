import { beforeEach, describe, expect, it, vi } from "vitest";

import { campaignRecordExtras, enrollmentRecordExtras } from "@/tests/helpers/crm-fixtures";

vi.mock("@/server/auth/require-auth", () => ({
  requireAuth: vi.fn(),
}));

vi.mock("@/server/workspaces/resolve-workspace", () => ({
  resolveWorkspace: vi.fn(),
}));

vi.mock("@/server/permissions/require-permission", () => ({
  requirePermission: vi.fn(),
}));

vi.mock("@/server/services/campaigns", () => ({
  listCampaignsForWorkspace: vi.fn(),
  createCampaignForWorkspace: vi.fn(),
  getCampaignForWorkspace: vi.fn(),
  archiveCampaignForWorkspace: vi.fn(),
  restoreCampaignForWorkspace: vi.fn(),
  purgeCampaignForWorkspace: vi.fn(),
}));

import { GET as getCampaigns, POST as postCampaign } from "@/app/api/workspaces/[workspaceSlug]/campaigns/route";
import { DELETE as deleteCampaign } from "@/app/api/workspaces/[workspaceSlug]/campaigns/[campaignId]/route";
import { POST as restoreCampaign } from "@/app/api/workspaces/[workspaceSlug]/campaigns/[campaignId]/restore/route";
import { POST as purgeCampaign } from "@/app/api/workspaces/[workspaceSlug]/campaigns/[campaignId]/purge/route";
import { POST as cronSendDue } from "@/app/api/cron/campaigns/send-due/route";
import { requireAuth } from "@/server/auth/require-auth";
import { requirePermission } from "@/server/permissions/require-permission";
import {
  createCampaignForWorkspace,
  listCampaignsForWorkspace,
  archiveCampaignForWorkspace,
  restoreCampaignForWorkspace,
  purgeCampaignForWorkspace,
} from "@/server/services/campaigns";
import { resolveWorkspace } from "@/server/workspaces/resolve-workspace";
import { AppError } from "@/server/errors";

vi.mock("@/server/services/campaign-sending", () => ({
  sendDueCampaignEmails: vi.fn(),
}));

import { sendDueCampaignEmails } from "@/server/services/campaign-sending";
import { resetEnvCacheForTests } from "@/server/env";

const sampleCampaign = {
  id: "camp-1",
  workspaceId: "ws-1",
  name: "Buyer Follow-up",
  status: "draft" as const,
  audienceType: "leads" as const,
  ...campaignRecordExtras,
  frequency: null,
  defaultFromName: null,
  createdBy: "user-1",
  ownerId: null,
  archivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  stepCount: 0,
  enrollmentCount: 0,
};

describe("campaign API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetEnvCacheForTests();
    process.env.CRON_SECRET = "test-cron-secret";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    process.env.MONGODB_URI = "mongodb://localhost:27017/evocrm";
  });

  it("returns UNAUTHENTICATED when not logged in", async () => {
    vi.mocked(requireAuth).mockRejectedValue(
      new AppError("UNAUTHENTICATED", "Authentication required."),
    );

    const response = await getCampaigns(
      new Request("http://localhost/api/workspaces/demo/campaigns"),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(401);
  });

  it("lists campaigns for campaign:read member", async () => {
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
        permissions: ["campaign:read"],
      },
    });
    vi.mocked(listCampaignsForWorkspace).mockResolvedValue({
      campaigns: [sampleCampaign],
      total: 1,
    });

    const response = await getCampaigns(
      new Request("http://localhost/api/workspaces/demo/campaigns"),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(200);
    expect(requirePermission).toHaveBeenCalledWith("ws-1", "user-1", "campaign:read");
  });

  it("creates campaign with campaign:create", async () => {
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
        permissions: ["campaign:create"],
      },
    });
    vi.mocked(createCampaignForWorkspace).mockResolvedValue(sampleCampaign);

    const response = await postCampaign(
      new Request("http://localhost/api/workspaces/demo/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Buyer Follow-up",
          audienceType: "leads",
          projectIds: campaignRecordExtras.projectIds,
          autoEnrollmentEnabled: campaignRecordExtras.autoEnrollmentEnabled,
          enrollmentTrigger: campaignRecordExtras.enrollmentTrigger,
          enrollmentRules: campaignRecordExtras.enrollmentRules,
        }),
      }),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(201);
    expect(requirePermission).toHaveBeenCalledWith("ws-1", "user-1", "campaign:create");
  });

  it("archives campaign with campaign:archive", async () => {
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
        permissions: ["campaign:archive"],
      },
    });
    vi.mocked(archiveCampaignForWorkspace).mockResolvedValue({
      ...sampleCampaign,
      status: "archived",
      archivedAt: new Date(),
    });

    const response = await deleteCampaign(
      new Request("http://localhost/api/workspaces/demo/campaigns/camp-1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ workspaceSlug: "demo", campaignId: "camp-1" }) },
    );

    expect(response.status).toBe(200);
    expect(requirePermission).toHaveBeenCalledWith("ws-1", "user-1", "campaign:archive");
  });

  it("restores campaign with campaign:update", async () => {
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
        permissions: ["campaign:update"],
      },
    });
    vi.mocked(restoreCampaignForWorkspace).mockResolvedValue({
      ...sampleCampaign,
      status: "draft",
      archivedAt: null,
    });

    const response = await restoreCampaign(
      new Request("http://localhost/api/workspaces/demo/campaigns/camp-1/restore", {
        method: "POST",
      }),
      { params: Promise.resolve({ workspaceSlug: "demo", campaignId: "camp-1" }) },
    );

    expect(response.status).toBe(200);
    expect(requirePermission).toHaveBeenCalledWith("ws-1", "user-1", "campaign:update");
    expect(restoreCampaignForWorkspace).toHaveBeenCalledWith("ws-1", "user-1", "camp-1");
  });

  it("purges campaign with campaign:delete", async () => {
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
        permissions: ["campaign:delete"],
      },
    });
    vi.mocked(purgeCampaignForWorkspace).mockResolvedValue({ deleted: true });

    const response = await purgeCampaign(
      new Request("http://localhost/api/workspaces/demo/campaigns/camp-1/purge", {
        method: "POST",
      }),
      { params: Promise.resolve({ workspaceSlug: "demo", campaignId: "camp-1" }) },
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data).toEqual({ deleted: true });
    expect(requirePermission).toHaveBeenCalledWith("ws-1", "user-1", "campaign:delete");
    expect(purgeCampaignForWorkspace).toHaveBeenCalledWith("ws-1", "user-1", "camp-1");
  });

  it("cron rejects missing CRON_SECRET", async () => {
    const response = await cronSendDue(
      new Request("http://localhost/api/cron/campaigns/send-due", {
        method: "POST",
        headers: { Authorization: "Bearer wrong" },
      }),
    );

    expect(response.status).toBe(401);
  });

  it("cron processes due enrollments with valid secret", async () => {
    vi.mocked(sendDueCampaignEmails).mockResolvedValue({
      processed: 2,
      sent: 1,
      skipped: 1,
      failed: 0,
    });

    const response = await cronSendDue(
      new Request("http://localhost/api/cron/campaigns/send-due", {
        method: "POST",
        headers: { Authorization: "Bearer test-cron-secret" },
      }),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data.sent).toBe(1);
    expect(sendDueCampaignEmails).toHaveBeenCalled();
  });
});
