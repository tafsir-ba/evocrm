import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { countAttachedCampaignsByProject } from "@/lib/project-attached-campaigns";
import {
  anyProjectHasInventory,
  formatProjectInventory,
  formatProjectInventoryLine,
} from "@/lib/projects-table";

const enrollLeadInCampaign = vi.fn();
const autoEnrollLead = vi.fn();

describe("project list attached-workflow display", () => {
  it("does not paint a workspace-wide campaign onto every project", () => {
    const byProject = countAttachedCampaignsByProject(
      [
        { projectIds: [] },
        { projectIds: ["grosvenor-vistas"] },
      ],
      ["grosvenor-vistas", "bulk-import-a", "bulk-import-b"],
    );

    expect(byProject.get("grosvenor-vistas")).toBe(1);
    expect(byProject.get("bulk-import-a")).toBe(0);
    expect(byProject.get("bulk-import-b")).toBe(0);

    const rows = [
      { counts: { activeCampaigns: byProject.get("grosvenor-vistas") } },
      { counts: { activeCampaigns: byProject.get("bulk-import-a") } },
      { counts: { activeCampaigns: byProject.get("bulk-import-b") } },
    ];

    expect(formatProjectInventoryLine(rows[1]?.counts)).toBe("—");
    expect(formatProjectInventoryLine(rows[2]?.counts)).toBe("—");
    expect(formatProjectInventoryLine(rows[0]?.counts)).toBe("1 workflow");
    expect(anyProjectHasInventory([rows[1]!, rows[2]!])).toBe(false);
  });

  it("labels attached configuration as workflows, not enrolled dripping", () => {
    expect(formatProjectInventory({ activeCampaigns: 1 })).toEqual([
      { key: "workflows", label: "Workflow", value: 1 },
    ]);
    expect(formatProjectInventory({ activeCampaigns: 2 })).toEqual([
      { key: "workflows", label: "Workflows", value: 2 },
    ]);
    expect(formatProjectInventoryLine({ activeCampaigns: 0 })).toBe("—");
  });

  it("cannot imply or trigger legacy-lead enrollment from the project list display", () => {
    const migratedLead = {
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
    };

    const display = formatProjectInventoryLine({
      activeCampaigns: countAttachedCampaignsByProject([{ projectIds: [] }], ["any"]).get(
        "any",
      ),
    });

    expect(display).toBe("—");
    expect(enrollLeadInCampaign).not.toHaveBeenCalled();
    expect(autoEnrollLead).not.toHaveBeenCalled();
    expect(migratedLead.attributes.campaignEnrollmentPolicy.defaultExcluded).toBe(true);

    const presentationSources = [
      "lib/project-attached-campaigns.ts",
      "lib/projects-table.ts",
      "components/projects/projects-table.tsx",
      "components/projects/projects-panel.tsx",
    ];
    for (const relative of presentationSources) {
      const source = readFileSync(resolve(process.cwd(), relative), "utf8");
      expect(source).not.toMatch(
        /campaign-auto-enrollment|enrollLeadInCampaign|createCampaignEnrollment|triggerAutomation/,
      );
    }
  });
});
