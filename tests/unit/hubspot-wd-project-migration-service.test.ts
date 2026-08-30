import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { checksumContactIds, hubspotContactIdempotencyKey } from "@/lib/hubspot-gv-pilot";
import {
  WD_MIGRATION_INBOUND_SOURCE,
  WD_MIGRATION_INTEGRATION_ID,
} from "@/lib/hubspot-wd-project-migration";

const DEST_ID = "6a1111111111111111111111";
const DEST_REF = "LEPARCDESCRETS";

vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: vi.fn(),
}));

vi.mock("@/server/repositories/campaign-enrollments", () => ({
  countCampaignEnrollmentsForLeadIds: vi.fn(),
}));

vi.mock("@/server/repositories/dictionary-items", () => ({
  findDictionaryItemByTypeAndKey: vi.fn(),
}));

vi.mock("@/server/repositories/hubspot-project-mappings", () => ({
  listHubSpotProjectMappings: vi.fn(),
}));

vi.mock("@/server/repositories/hubspot-migration-runs", () => ({
  createHubSpotMigrationRun: vi.fn(),
  findActiveExecuteRunByChecksum: vi.fn(),
  updateHubSpotMigrationRun: vi.fn(),
}));

vi.mock("@/server/repositories/integrations", () => ({
  findIntegrationById: vi.fn(),
}));

vi.mock("@/server/repositories/leads", () => ({
  countActiveLeadsForProject: vi.fn(),
  findLeadByIntegrationIdempotencyKey: vi.fn(),
  findLeadsByIds: vi.fn(),
  findLeadsForHubSpotGvPilotDedupe: vi.fn(),
}));

vi.mock("@/server/repositories/projects", () => ({
  findProjectById: vi.fn(),
}));

vi.mock("@/server/services/hubspot-client", () => ({
  fetchHubSpotContactsByIds: vi.fn(),
}));

vi.mock("@/server/services/leads", () => ({
  createLeadForWorkspace: vi.fn(),
}));

import { countCampaignEnrollmentsForLeadIds } from "@/server/repositories/campaign-enrollments";
import { findDictionaryItemByTypeAndKey } from "@/server/repositories/dictionary-items";
import {
  createHubSpotMigrationRun,
  findActiveExecuteRunByChecksum,
} from "@/server/repositories/hubspot-migration-runs";
import { listHubSpotProjectMappings } from "@/server/repositories/hubspot-project-mappings";
import { findIntegrationById } from "@/server/repositories/integrations";
import {
  countActiveLeadsForProject,
  findLeadByIntegrationIdempotencyKey,
  findLeadsByIds,
  findLeadsForHubSpotGvPilotDedupe,
} from "@/server/repositories/leads";
import { findProjectById } from "@/server/repositories/projects";
import { fetchHubSpotContactsByIds } from "@/server/services/hubspot-client";
import { runHubSpotWdProjectMigration } from "@/server/services/hubspot-wd-project-migration";
import { createLeadForWorkspace } from "@/server/services/leads";

const IDS = ["20001", "20002"];

async function writeManifest(cwd: string): Promise<void> {
  const dir = path.join(cwd, "migrations/hubspot-wd-project");
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, "leparcdescrets-batch-01.json"),
    JSON.stringify({
      name: "leparcdescrets-batch-01",
      version: 1,
      portalId: "5699191",
      workspaceId: "6a2f0444438006b304af77ec",
      destinationProjectId: DEST_ID,
      destinationReference: DEST_REF,
      slug: "leparcdescrets",
      sourceHubSpotProjectId: "leparcdescrets",
      size: IDS.length,
      selection: {
        pool: "new_write_eligible",
        sort: "hubspot_contact_id_asc",
        exclude: ["email_match", "identity_conflict", "multi_project"],
      },
      hubspotContactIds: IDS,
      idChecksum: checksumContactIds(IDS),
    }),
  );
}

function eligibleProperties(id: string): Record<string, string | null> {
  return {
    firstname: "Pat",
    lastname: `Pilot${id}`,
    email: `pilot-${id}@example.com`,
    phone: "+15550000000",
    wd_project: "leparcdescrets",
    hs_content_membership_notes: "leparcdescrets",
    wd_broker_assigned: null,
    product_intersted_in: null,
  };
}

describe("runHubSpotWdProjectMigration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findProjectById).mockResolvedValue({
      id: DEST_ID,
      reference: DEST_REF,
      archivedAt: null,
    } as never);
    vi.mocked(findIntegrationById).mockResolvedValue({
      id: WD_MIGRATION_INTEGRATION_ID,
      status: "active",
      archivedAt: null,
      externalAccountId: "5699191",
      defaultProjectId: "6a2f13d144d6c01e4213ada9",
      allowProjectOverride: false,
      createdBy: "actor-1",
    } as never);
    vi.mocked(listHubSpotProjectMappings).mockResolvedValue([
      {
        hubspotProjectId: "leparcdescrets",
        status: "mapped",
        evoProjectId: DEST_ID,
      },
    ] as never);
    vi.mocked(findLeadsForHubSpotGvPilotDedupe).mockResolvedValue([]);
    vi.mocked(findLeadsByIds).mockImplementation(async (_ws, ids) =>
      ids.map((id) => ({
        id,
        projectId: DEST_ID,
        attributes: {
          integration: {
            inboundSource: WD_MIGRATION_INBOUND_SOURCE,
            idempotencyKey: `hubspot:contact:${id}`,
          },
          campaignEnrollmentPolicy: { defaultExcluded: true, source: "hubspot_legacy_migration" },
        },
      })) as never,
    );
    vi.mocked(countActiveLeadsForProject).mockResolvedValue(0);
    vi.mocked(countCampaignEnrollmentsForLeadIds).mockResolvedValue(0);
    vi.mocked(findLeadByIntegrationIdempotencyKey).mockResolvedValue(null);
    vi.mocked(findActiveExecuteRunByChecksum).mockResolvedValue(null);
    vi.mocked(createHubSpotMigrationRun).mockResolvedValue({ id: "run-1" } as never);
    vi.mocked(findDictionaryItemByTypeAndKey).mockImplementation(async (_ws, type, key) => {
      if (type === "lead_status" && key === "new") {
        return { id: "status-new", isActive: true } as never;
      }
      if (type === "lead_source" && key === "hubspot") {
        return { id: "source-hubspot", isActive: true } as never;
      }
      return null;
    });
    vi.mocked(fetchHubSpotContactsByIds).mockResolvedValue(
      IDS.map((id) => ({ id, properties: eligibleProperties(id) })),
    );
    vi.mocked(createLeadForWorkspace).mockImplementation(async (_ws, _actor, input) => ({
      lead: {
        id: `lead-${String((input.attributes?.integration as { externalId?: string })?.externalId ?? "x")}`,
        projectId: DEST_ID,
      },
      warnings: [],
    } as never));
  });

  it("dry-runs without writing and keeps the mapped destination", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "wd-mig-"));
    await writeManifest(cwd);

    const report = await runHubSpotWdProjectMigration({
      argv: ["--manifest=leparcdescrets-batch-01"],
      cwd,
      accessToken: "pat-test-token",
    });

    expect(report.mode).toBe("dry-run");
    expect(report.persisted).toBe(false);
    expect(report.wouldCreate).toBe(2);
    expect(report.destinationProjectId).toBe(DEST_ID);
    expect(report.reconciliation.destinationIsGv).toBe(false);
    expect(report.liveWriteGate.ready).toBe(true);
    expect(createLeadForWorkspace).not.toHaveBeenCalled();
    expect(createHubSpotMigrationRun).not.toHaveBeenCalled();
  });

  it("refuses to run when the mapping is missing so GV cannot be used as fallback", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "wd-mig-"));
    await writeManifest(cwd);
    vi.mocked(listHubSpotProjectMappings).mockResolvedValue([]);

    await expect(
      runHubSpotWdProjectMigration({
        argv: ["--manifest=leparcdescrets-batch-01"],
        cwd,
        accessToken: "pat-test-token",
      }),
    ).rejects.toThrow(/explicit_mapping_required/);
    expect(createLeadForWorkspace).not.toHaveBeenCalled();
  });

  it("creates leads on the mapped destination with automation off and the campaign guard", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "wd-mig-"));
    await writeManifest(cwd);

    const report = await runHubSpotWdProjectMigration({
      argv: ["--execute", "--confirm-write", "--manifest=leparcdescrets-batch-01"],
      cwd,
      accessToken: "pat-test-token",
    });

    expect(report.mode).toBe("execute");
    expect(report.created).toBe(2);
    expect(createLeadForWorkspace).toHaveBeenCalledWith(
      "6a2f0444438006b304af77ec",
      "actor-1",
      expect.objectContaining({
        projectId: DEST_ID,
        attributes: {
          integration: {
            integrationId: WD_MIGRATION_INTEGRATION_ID,
            externalId: "20001",
            idempotencyKey: hubspotContactIdempotencyKey("20001"),
            inboundSource: WD_MIGRATION_INBOUND_SOURCE,
          },
          campaignEnrollmentPolicy: {
            defaultExcluded: true,
            source: "hubspot_legacy_migration",
          },
        },
      }),
      { triggerAutomation: false },
    );
    expect(createLeadForWorkspace).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ projectId: "6a2f13d144d6c01e4213ada9" }),
      expect.anything(),
    );
  });
});
