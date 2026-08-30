import { describe, expect, it } from "vitest";

import {
  formatInboundDemandAudit,
  formatInboundDemandLine,
  projectDemandStatus,
  resolveLeadInboundReceivedAt,
  summarizeProjectInboundDemand,
} from "@/lib/inbound-received-at";
import { projectListStatus } from "@/lib/projects-table";

const now = new Date(2026, 7, 30, 12, 0, 0);
const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

const GROSVENOR_VISTAS_ID = "6a2f13d144d6c01e4213ada9";

describe("genuine inbound received-at", () => {
  it("uses receivedAt for native website / form / API captures", () => {
    const resolved = resolveLeadInboundReceivedAt({
      createdAt: now,
      attributes: {
        integration: {
          integrationId: "int-website-gv",
          inboundSource: "landing-hero",
          receivedAt: daysAgo(2).toISOString(),
        },
      },
    });

    expect(resolved?.basis).toBe("received_at");
    expect(resolved?.at.toISOString()).toBe(daysAgo(2).toISOString());
    expect(
      projectDemandStatus({ lastGenuineInboundAt: resolved?.at, now }).label,
    ).toBe("Active");
  });

  it("falls back to capture createdAt only for live inbound, never for HubSpot imports", () => {
    const liveWithoutStamp = resolveLeadInboundReceivedAt({
      createdAt: daysAgo(3),
      attributes: {
        integration: {
          integrationId: "int-website-gv",
          inboundSource: "landing-hero",
        },
      },
    });
    expect(liveWithoutStamp).toEqual({
      at: daysAgo(3),
      basis: "capture_created",
    });

    const importedToday = resolveLeadInboundReceivedAt({
      createdAt: now,
      attributes: {
        integration: {
          inboundSource: "hubspot-gv-pilot",
          idempotencyKey: "hubspot:contact:1363451",
        },
        campaignEnrollmentPolicy: {
          defaultExcluded: true,
          source: "hubspot_legacy_migration",
        },
      },
    });
    expect(importedToday).toBeNull();
  });

  it("uses HubSpot source createdate when present, and stays Unknown without it", () => {
    const withSourceDate = resolveLeadInboundReceivedAt({
      createdAt: now,
      attributes: {
        integration: {
          inboundSource: "hubspot",
          idempotencyKey: "hubspot:contact:99",
          sourceCreatedAt: daysAgo(10).toISOString(),
        },
        campaignEnrollmentPolicy: {
          defaultExcluded: true,
          source: "hubspot_legacy_migration",
        },
      },
    });
    expect(withSourceDate?.basis).toBe("source_created");
    expect(projectDemandStatus({ lastGenuineInboundAt: withSourceDate?.at, now }).label).toBe(
      "Active",
    );

    const importWithoutSourceDate = resolveLeadInboundReceivedAt({
      createdAt: now,
      attributes: {
        integration: {
          inboundSource: "hubspot-wd-project",
          idempotencyKey: "hubspot:contact:1",
        },
      },
    });
    expect(importWithoutSourceDate).toBeNull();
    expect(projectDemandStatus({ lastGenuineInboundAt: null, now }).label).toBe("Unknown");
  });

  it("marks demand stale when the newest genuine inbound is older than 30 days", () => {
    expect(
      projectDemandStatus({ lastGenuineInboundAt: daysAgo(45), now }).label,
    ).toBe("Stale");
    expect(
      projectDemandStatus({ lastGenuineInboundAt: daysAgo(30), now }).label,
    ).toBe("Active");
    expect(
      projectDemandStatus({ lastGenuineInboundAt: daysAgo(31), now }).label,
    ).toBe("Stale");
  });

  it("never treats project createdAt, edits, or CRM activity as inbound demand", () => {
    expect(
      projectListStatus({
        createdAt: now,
        lastActivityAt: now,
        lastGenuineInboundAt: null,
        now,
      }).label,
    ).toBe("Unknown");
  });

  it("classifies Grosvenor Vistas from website inbound evidence, not the project name", () => {
    const importedToday = summarizeProjectInboundDemand([
      {
        projectId: GROSVENOR_VISTAS_ID,
        createdAt: now,
        attributes: {
          integration: {
            inboundSource: "hubspot-gv-pilot",
            idempotencyKey: "hubspot:contact:1363451",
          },
          campaignEnrollmentPolicy: {
            defaultExcluded: true,
            source: "hubspot_legacy_migration",
          },
        },
      },
    ]);
    expect(importedToday.has(GROSVENOR_VISTAS_ID)).toBe(false);
    expect(
      projectDemandStatus({
        lastGenuineInboundAt: importedToday.get(GROSVENOR_VISTAS_ID)?.at ?? null,
        now,
      }).label,
    ).toBe("Unknown");

    const websiteInbound = summarizeProjectInboundDemand([
      {
        projectId: GROSVENOR_VISTAS_ID,
        createdAt: now,
        attributes: {
          integration: {
            inboundSource: "hubspot-gv-pilot",
            idempotencyKey: "hubspot:contact:1363451",
          },
        },
      },
      {
        projectId: GROSVENOR_VISTAS_ID,
        createdAt: daysAgo(40),
        attributes: {
          integration: {
            integrationId: "int-website-gv",
            inboundSource: "landing-hero",
            receivedAt: daysAgo(2).toISOString(),
          },
        },
      },
    ]);
    const latest = websiteInbound.get(GROSVENOR_VISTAS_ID);
    expect(latest?.basis).toBe("received_at");
    expect(latest?.at.toISOString()).toBe(daysAgo(2).toISOString());
    expect(projectDemandStatus({ lastGenuineInboundAt: latest?.at, now }).label).toBe("Active");
  });

  it("surfaces an auditable last-inbound line", () => {
    expect(formatInboundDemandLine(null, null, now)).toBe("Needs inbound date");
    expect(formatInboundDemandLine(daysAgo(3), "received_at", now)).toBe("3d · received");
    expect(formatInboundDemandAudit(daysAgo(3), "source_created")).toBe(
      `${daysAgo(3).toISOString()} · source date`,
    );
  });
});
