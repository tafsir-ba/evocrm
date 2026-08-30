import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  GV_PILOT_INBOUND_SOURCE,
  GV_PILOT_INTEGRATION_ID,
  GV_PILOT_PROJECT_ID,
  checksumContactIds,
  hubspotContactIdempotencyKey,
} from "@/lib/hubspot-gv-pilot";

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

import { createAuditLog } from "@/server/audit/create-audit-log";
import { countCampaignEnrollmentsForLeadIds } from "@/server/repositories/campaign-enrollments";
import { findDictionaryItemByTypeAndKey } from "@/server/repositories/dictionary-items";
import {
  createHubSpotMigrationRun,
  findActiveExecuteRunByChecksum,
  updateHubSpotMigrationRun,
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
import { runHubSpotGvPilot } from "@/server/services/hubspot-gv-pilot";
import { createLeadForWorkspace } from "@/server/services/leads";

const IDS = Array.from({ length: 25 }, (_, index) => String(10_000 + index));

async function writeManifest(cwd: string): Promise<void> {
  const dir = path.join(cwd, "migrations/hubspot-gv-pilot");
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, "gv-pilot-batch-01.json"),
    JSON.stringify({
      name: "gv-pilot-batch-01",
      version: 1,
      portalId: "5699191",
      workspaceId: "6a2f0444438006b304af77ec",
      destinationProjectId: GV_PILOT_PROJECT_ID,
      destinationReference: "GV",
      slug: "grosvenorvistas",
      size: 25,
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
    wd_project: "grosvenorvistas",
    hs_content_membership_notes: "grosvenorvistas",
    wd_broker_assigned: null,
    product_intersted_in: null,
  };
}

describe("runHubSpotGvPilot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findProjectById).mockResolvedValue({
      id: GV_PILOT_PROJECT_ID,
      reference: "GV",
      archivedAt: null,
    } as never);
    vi.mocked(findIntegrationById).mockResolvedValue({
      id: GV_PILOT_INTEGRATION_ID,
      status: "active",
      archivedAt: null,
      externalAccountId: "5699191",
      defaultProjectId: GV_PILOT_PROJECT_ID,
      allowProjectOverride: false,
      createdBy: "actor-1",
    } as never);
    vi.mocked(listHubSpotProjectMappings).mockResolvedValue([]);
    vi.mocked(findLeadsForHubSpotGvPilotDedupe).mockResolvedValue([]);
    vi.mocked(findLeadsByIds).mockImplementation(async (_ws, ids) =>
      ids.map((id) => ({
        id,
        attributes: {
          integration: { inboundSource: "hubspot-gv-pilot", idempotencyKey: `hubspot:contact:${id}` },
          campaignEnrollmentPolicy: { defaultExcluded: true, source: "hubspot_legacy_migration" },
        },
      })) as never,
    );
    vi.mocked(countActiveLeadsForProject).mockResolvedValue(313);
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
        id: `lead-${input.attributes?.integration && typeof input.attributes.integration === "object" && "externalId" in input.attributes.integration ? String((input.attributes.integration as { externalId?: string }).externalId) : "x"}`,
        projectId: GV_PILOT_PROJECT_ID,
      },
      warnings: [],
    } as never));
  });

  it("defaults to a non-persisting dry-run and never creates leads", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "gv-pilot-"));
    await writeManifest(cwd);

    const report = await runHubSpotGvPilot({
      argv: ["--manifest=gv-pilot-batch-01"],
      cwd,
      accessToken: "pat-test-token",
    });

    expect(report.mode).toBe("dry-run");
    expect(report.persisted).toBe(false);
    expect(report.persistReason).toBe("default_dry_run");
    expect(report.wouldCreate).toBe(25);
    expect(report.created).toBe(0);
    expect(report.unexpected).toBe(0);
    expect(report.liveWriteGate.ready).toBe(true);
    expect(createLeadForWorkspace).not.toHaveBeenCalled();
    expect(createHubSpotMigrationRun).not.toHaveBeenCalled();
    expect(createAuditLog).not.toHaveBeenCalled();
    expect(updateHubSpotMigrationRun).not.toHaveBeenCalled();
  });

  it("does not persist when --execute is set without --confirm-write", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "gv-pilot-"));
    await writeManifest(cwd);

    const report = await runHubSpotGvPilot({
      argv: ["--execute", "--manifest=gv-pilot-batch-01"],
      cwd,
      accessToken: "pat-test-token",
    });

    expect(report.persisted).toBe(false);
    expect(report.persistReason).toBe("execute_requires_confirm_write");
    expect(createLeadForWorkspace).not.toHaveBeenCalled();
  });

  it("creates leads only with execute+confirm-write+manifest, HubSpot-id keys, GV dest, and automation off", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "gv-pilot-"));
    await writeManifest(cwd);

    const report = await runHubSpotGvPilot({
      argv: ["--execute", "--confirm-write", "--manifest=gv-pilot-batch-01"],
      cwd,
      accessToken: "pat-test-token",
    });

    expect(report.mode).toBe("execute");
    expect(report.persisted).toBe(true);
    expect(report.created).toBe(25);
    expect(createLeadForWorkspace).toHaveBeenCalledTimes(25);
    expect(createLeadForWorkspace).toHaveBeenCalledWith(
      "6a2f0444438006b304af77ec",
      "actor-1",
      expect.objectContaining({
        projectId: GV_PILOT_PROJECT_ID,
        attributes: {
          integration: {
            integrationId: GV_PILOT_INTEGRATION_ID,
            externalId: "10000",
            idempotencyKey: hubspotContactIdempotencyKey("10000"),
            inboundSource: GV_PILOT_INBOUND_SOURCE,
          },
          campaignEnrollmentPolicy: {
            defaultExcluded: true,
            source: "hubspot_legacy_migration",
          },
        },
      }),
      { triggerAutomation: false },
    );
    expect(createHubSpotMigrationRun).toHaveBeenCalledTimes(1);
  });

  it("aborts execute after one unexpected duplicate and leaves remaining records unprocessed", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "gv-pilot-"));
    await writeManifest(cwd);
    vi.mocked(findLeadByIntegrationIdempotencyKey).mockResolvedValueOnce({
      id: "existing-lead",
    } as never);

    const report = await runHubSpotGvPilot({
      argv: ["--execute", "--confirm-write", "--manifest=gv-pilot-batch-01"],
      cwd,
      accessToken: "pat-test-token",
    });

    expect(report.aborted).toBe(true);
    expect(report.unexpected).toBe(1);
    expect(report.created).toBe(0);
    expect(report.records.filter((record) => record.outcome === "aborted_unprocessed")).toHaveLength(
      24,
    );
    expect(createLeadForWorkspace).not.toHaveBeenCalled();
  });

  it("keeps email-match records read-only and does not write them", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "gv-pilot-"));
    await writeManifest(cwd);
    vi.mocked(findLeadsForHubSpotGvPilotDedupe).mockResolvedValue([
      {
        id: "gv-lead-1",
        projectId: GV_PILOT_PROJECT_ID,
        emailNormalized: "pilot-10000@example.com",
        firstName: "Pat",
        lastName: "Pilot10000",
        attributes: {},
      },
    ]);

    const report = await runHubSpotGvPilot({
      argv: ["--manifest=gv-pilot-batch-01"],
      cwd,
      accessToken: "pat-test-token",
    });

    expect(report.cohorts.email_match_readonly).toBe(1);
    expect(report.wouldCreate).toBe(24);
    expect(report.liveWriteGate.ready).toBe(false);
    expect(report.liveWriteGate.blockers).toEqual(
      expect.arrayContaining(["would_create_mismatch", "email_match_in_batch"]),
    );
    expect(createLeadForWorkspace).not.toHaveBeenCalled();
  });
});
