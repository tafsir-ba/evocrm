import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findAllWorkspaces: vi.fn(),
  findDictionaryItemByTypeAndKey: vi.fn(),
  findActiveDictionaryItemByTypeAndLabel: vi.fn(),
  findStaleNewLeadCandidates: vi.fn(),
  findLatestActivityAtByLead: vi.fn(),
  findLatestVisitSessionAtByLead: vi.fn(),
  findLatestTreatmentAuditAtByLead: vi.fn(),
  markLeadUntreatedIfStillNew: vi.fn(),
  createAuditLog: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock("@/server/repositories/workspaces", () => ({
  findAllWorkspaces: mocks.findAllWorkspaces,
}));
vi.mock("@/server/repositories/dictionary-items", () => ({
  findDictionaryItemByTypeAndKey: mocks.findDictionaryItemByTypeAndKey,
  findActiveDictionaryItemByTypeAndLabel: mocks.findActiveDictionaryItemByTypeAndLabel,
}));
vi.mock("@/server/repositories/lead-untreated", () => ({
  findStaleNewLeadCandidates: mocks.findStaleNewLeadCandidates,
  findLatestActivityAtByLead: mocks.findLatestActivityAtByLead,
  findLatestVisitSessionAtByLead: mocks.findLatestVisitSessionAtByLead,
  findLatestTreatmentAuditAtByLead: mocks.findLatestTreatmentAuditAtByLead,
  markLeadUntreatedIfStillNew: mocks.markLeadUntreatedIfStillNew,
}));
vi.mock("@/server/audit/create-audit-log", () => ({ createAuditLog: mocks.createAuditLog }));
vi.mock("@/server/observability/capture-error", () => ({ captureError: mocks.captureError }));

import {
  resolveUntreatedLeadStatus,
  runLeadUntreatedAutomation,
} from "@/server/services/lead-untreated-automation";

const NOW = new Date("2026-10-26T12:00:00.000Z");
const WS = "64b000000000000000000001";
const OWNER = "64b0000000000000000000aa";

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
}

function statusItem(key: string, id: string, overrides: Record<string, unknown> = {}) {
  return { id, key, label: key, type: "lead_status", isActive: true, ...overrides };
}

function lead(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    projectId: "64b0000000000000000000p1",
    statusId: "status-new",
    createdAt: daysAgo(60),
    lastContactedAt: null,
    attributes: {},
    archivedAt: null,
    ...overrides,
  };
}

function page(
  candidates: ReturnType<typeof lead>[],
  overrides: { skippedInvalid?: number; nextAfterId?: string | null } = {},
) {
  return { candidates, skippedInvalid: 0, nextAfterId: null, ...overrides };
}

function setDictionary(items: Record<string, ReturnType<typeof statusItem> | null>) {
  mocks.findDictionaryItemByTypeAndKey.mockImplementation(
    async (_ws: string, _type: string, key: string) => items[key] ?? null,
  );
}

describe("runLeadUntreatedAutomation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findAllWorkspaces.mockResolvedValue([
      { id: WS, slug: "evo", createdBy: OWNER },
    ]);
    setDictionary({
      new: statusItem("new", "status-new"),
      untreated: statusItem("untreated", "status-untreated", { label: "Untreated" }),
    });
    mocks.findActiveDictionaryItemByTypeAndLabel.mockResolvedValue(null);
    mocks.findLatestActivityAtByLead.mockResolvedValue(new Map());
    mocks.findLatestVisitSessionAtByLead.mockResolvedValue(new Map());
    mocks.findLatestTreatmentAuditAtByLead.mockResolvedValue(new Map());
    mocks.markLeadUntreatedIfStillNew.mockResolvedValue(true);
  });

  it("moves New leads idle for 30+ days to the existing Untreated status and audits it", async () => {
    mocks.findStaleNewLeadCandidates.mockResolvedValueOnce(page([lead("lead-1")]));

    const summary = await runLeadUntreatedAutomation({ now: NOW });

    expect(mocks.findStaleNewLeadCandidates).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WS,
        newStatusId: "status-new",
        cutoff: daysAgo(30),
      }),
    );
    expect(mocks.markLeadUntreatedIfStillNew).toHaveBeenCalledWith({
      workspaceId: WS,
      leadId: "lead-1",
      newStatusId: "status-new",
      untreatedStatusId: "status-untreated",
    });
    expect(mocks.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WS,
        actorId: OWNER,
        action: "lead.status_changed",
        entityType: "lead",
        entityId: "lead-1",
        before: { statusId: "status-new" },
        after: expect.objectContaining({
          statusId: "status-untreated",
          automation: "lead_untreated_rule",
          idleDays: 60,
        }),
      }),
    );
    expect(summary).toMatchObject({ moved: 1, eligible: 1, scanned: 1, workspacesSkipped: 0 });
  });

  it("keeps New leads that had activity, notes, or treatment audits inside the window", async () => {
    mocks.findStaleNewLeadCandidates.mockResolvedValueOnce(
      page([
        lead("lead-activity"),
        lead("lead-visit"),
        lead("lead-audit"),
        lead("lead-inbound", {
          attributes: { integration: { receivedAt: daysAgo(2).toISOString() } },
        }),
        lead("lead-idle"),
      ]),
    );
    mocks.findLatestActivityAtByLead.mockResolvedValue(
      new Map([["lead-activity", daysAgo(5)], ["lead-idle", daysAgo(40)]]),
    );
    mocks.findLatestVisitSessionAtByLead.mockResolvedValue(new Map([["lead-visit", daysAgo(12)]]));
    mocks.findLatestTreatmentAuditAtByLead.mockResolvedValue(new Map([["lead-audit", daysAgo(29)]]));

    const summary = await runLeadUntreatedAutomation({ now: NOW });

    expect(mocks.markLeadUntreatedIfStillNew).toHaveBeenCalledTimes(1);
    expect(mocks.markLeadUntreatedIfStillNew).toHaveBeenCalledWith(
      expect.objectContaining({ leadId: "lead-idle" }),
    );
    expect(summary.results[0]).toMatchObject({ keptRecentTreatment: 4, moved: 1 });
  });

  it("does not touch leads whose status is no longer New (already Untreated or other)", async () => {
    mocks.findStaleNewLeadCandidates.mockResolvedValueOnce(
      page([
        lead("lead-untreated", { statusId: "status-untreated" }),
        lead("lead-contacted", { statusId: "status-contacted" }),
      ]),
    );

    const summary = await runLeadUntreatedAutomation({ now: NOW });

    expect(mocks.markLeadUntreatedIfStillNew).not.toHaveBeenCalled();
    expect(mocks.createAuditLog).not.toHaveBeenCalled();
    expect(summary.moved).toBe(0);
  });

  it("does not audit when a concurrent update already moved the lead off New", async () => {
    mocks.findStaleNewLeadCandidates.mockResolvedValueOnce(page([lead("lead-1")]));
    mocks.markLeadUntreatedIfStillNew.mockResolvedValueOnce(false);

    const summary = await runLeadUntreatedAutomation({ now: NOW });

    expect(mocks.createAuditLog).not.toHaveBeenCalled();
    expect(summary.results[0]).toMatchObject({ lostRace: 1, moved: 0 });
  });

  it("dry run reports eligible leads without writing", async () => {
    mocks.findStaleNewLeadCandidates.mockResolvedValueOnce(page([lead("lead-1"), lead("lead-2")]));

    const summary = await runLeadUntreatedAutomation({ now: NOW, dryRun: true });

    expect(mocks.markLeadUntreatedIfStillNew).not.toHaveBeenCalled();
    expect(mocks.createAuditLog).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ dryRun: true, eligible: 2, moved: 0 });
  });

  it("skips a workspace without an Untreated status instead of creating one", async () => {
    setDictionary({ new: statusItem("new", "status-new") });

    const summary = await runLeadUntreatedAutomation({ now: NOW });

    expect(mocks.findStaleNewLeadCandidates).not.toHaveBeenCalled();
    expect(summary.results[0].skipped).toBe("untreated_status_missing");
    expect(summary.workspacesSkipped).toBe(1);
  });

  it("caps updates per workspace and flags truncation", async () => {
    mocks.findStaleNewLeadCandidates.mockResolvedValueOnce(
      page([
        lead("lead-1"),
        lead("lead-2"),
        lead("lead-3"),
      ]),
    );

    const summary = await runLeadUntreatedAutomation({ now: NOW, maxUpdatesPerWorkspace: 2 });

    expect(mocks.markLeadUntreatedIfStillNew).toHaveBeenCalledTimes(2);
    expect(summary.results[0]).toMatchObject({ moved: 2, truncated: true });
  });

  it("pages through candidates with an id cursor", async () => {
    mocks.findStaleNewLeadCandidates
      .mockResolvedValueOnce(page([lead("lead-1"), lead("lead-2")], { nextAfterId: "lead-2" }))
      .mockResolvedValueOnce(page([lead("lead-3")]));

    const summary = await runLeadUntreatedAutomation({ now: NOW, pageSize: 2 });

    expect(mocks.findStaleNewLeadCandidates).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ afterId: "lead-2" }),
    );
    expect(summary.moved).toBe(3);
  });

  it("keeps scanning past invalid lead rows and reports them", async () => {
    mocks.findStaleNewLeadCandidates
      .mockResolvedValueOnce(page([lead("lead-1")], { skippedInvalid: 1, nextAfterId: "lead-bad" }))
      .mockResolvedValueOnce(page([], { skippedInvalid: 2, nextAfterId: "lead-bad-3" }))
      .mockResolvedValueOnce(page([lead("lead-2")]));

    const summary = await runLeadUntreatedAutomation({ now: NOW, dryRun: true, pageSize: 2 });

    expect(mocks.findStaleNewLeadCandidates).toHaveBeenCalledTimes(3);
    expect(mocks.findStaleNewLeadCandidates).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ afterId: "lead-bad" }),
    );
    expect(mocks.findStaleNewLeadCandidates).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ afterId: "lead-bad-3" }),
    );
    expect(mocks.captureError).not.toHaveBeenCalled();
    expect(summary.results[0]).toMatchObject({
      skipped: null,
      scanned: 2,
      skippedInvalid: 3,
      eligible: 2,
    });
    expect(summary.skippedInvalid).toBe(3);
  });

  it("isolates per-workspace failures", async () => {
    mocks.findAllWorkspaces.mockResolvedValue([
      { id: WS, slug: "evo", createdBy: OWNER },
      { id: "64b000000000000000000002", slug: "other", createdBy: OWNER },
    ]);
    mocks.findStaleNewLeadCandidates
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(page([lead("lead-9")]));

    const summary = await runLeadUntreatedAutomation({ now: NOW });

    expect(summary.results.map((result) => result.skipped)).toEqual(["failed", null]);
    expect(summary.moved).toBe(1);
    expect(mocks.captureError).toHaveBeenCalledTimes(1);
  });
});

describe("resolveUntreatedLeadStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prefers the untreated key", async () => {
    setDictionary({ untreated: statusItem("untreated", "by-key") });
    await expect(resolveUntreatedLeadStatus(WS)).resolves.toMatchObject({
      ok: true,
      item: { id: "by-key" },
    });
    expect(mocks.findActiveDictionaryItemByTypeAndLabel).not.toHaveBeenCalled();
  });

  it("falls back to the existing item labelled Untreated", async () => {
    setDictionary({});
    mocks.findActiveDictionaryItemByTypeAndLabel.mockResolvedValue(
      statusItem("custom_untreated", "by-label", { label: "Untreated" }),
    );
    await expect(resolveUntreatedLeadStatus(WS)).resolves.toMatchObject({
      ok: true,
      item: { id: "by-label" },
    });
    expect(mocks.findActiveDictionaryItemByTypeAndLabel).toHaveBeenCalledWith(
      WS,
      "lead_status",
      "Untreated",
    );
  });

  it("reports an inactive Untreated key", async () => {
    setDictionary({ untreated: statusItem("untreated", "by-key", { isActive: false }) });
    mocks.findActiveDictionaryItemByTypeAndLabel.mockResolvedValue(null);
    await expect(resolveUntreatedLeadStatus(WS)).resolves.toEqual({
      ok: false,
      reason: "untreated_status_inactive",
    });
  });
});
