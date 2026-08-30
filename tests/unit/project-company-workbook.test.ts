import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  WORKBOOK_COMPANY_MAPPING,
  workbookCompanyApplyEntries,
  workbookCompanyCatalogSummary,
} from "@/lib/project-company-workbook-catalog";
import {
  attachBilledLinkedPrimary,
  billedLinkedProvenance,
  confirmWorkbookWriteGuards,
  decideWorkbookCompanyCatalog,
  decideWorkbookCompanyLink,
  matchExactProjects,
  normalizeExactProjectNameKey,
  verifyBilledLinkedPrimary,
  type WorkbookProjectCandidate,
} from "@/lib/project-company-workbook";
import { normalizeCompanyNameKey } from "@/lib/project-operating-record";

function project(
  name: string,
  overrides: Partial<WorkbookProjectCandidate> = {},
): WorkbookProjectCandidate {
  return {
    id: overrides.id ?? `proj-${normalizeExactProjectNameKey(name).replace(/\s+/g, "-")}`,
    name,
    reference: overrides.reference ?? null,
    archivedAt: overrides.archivedAt ?? null,
    companies: overrides.companies ?? [],
  };
}

describe("workbook company catalog", () => {
  it("lists the 20 approved apply rows and the required holds", () => {
    const summary = workbookCompanyCatalogSummary();
    expect(summary.apply).toBe(20);
    expect(summary.hold).toBe(5);
    expect(summary.personReview).toBe(1);
    expect(summary.noProject).toBe(1);

    const applyNames = workbookCompanyApplyEntries().map((entry) => entry.projectName);
    expect(applyNames).toEqual([
      "Arbora",
      "Avant-Scène",
      "Campanules",
      "Carawina",
      "Cardinal",
      "Corsier-sur-Vevey",
      "Eleven 41",
      "Floréal",
      "Jardin des Nations",
      "Le Parc des Crêts",
      "Mathod",
      "Namaya",
      "Ormet",
      "Osmose",
      "Portes du Lac",
      "Résidence Symbiose",
      "Seymaz 44",
      "Smarthill",
      "Tannay Horizon",
      "V77",
    ]);

    const grosvenor = WORKBOOK_COMPANY_MAPPING.find((entry) => entry.key === "grosvenor-vistas");
    expect(grosvenor?.kind).toBe("person_review");
    expect(grosvenor?.sourceValue).toBe("Nigel Benjamin");
    expect(grosvenor?.companyName).toBeUndefined();

    const payerne = WORKBOOK_COMPANY_MAPPING.find((entry) => entry.key === "payerne-envergure");
    expect(payerne?.kind).toBe("no_project");

    expect(
      workbookCompanyApplyEntries().filter((entry) => entry.companyName === "NewHome Services SA")
        .map((entry) => entry.projectName),
    ).toEqual(["Mathod", "Résidence Symbiose"]);
  });

  it("stays aligned with the checked-in mapping manifest", () => {
    const manifest = JSON.parse(
      readFileSync(path.join(process.cwd(), "migrations/project-companies/mapping-manifest.json"), "utf8"),
    ) as {
      apply: Array<{ projectName: string; companyName: string }>;
      personReview: Array<{ sourceValue: string }>;
      hold: Array<{ projectName: string }>;
      noProject: Array<{ projectName: string }>;
    };

    expect(manifest.apply).toEqual(
      workbookCompanyApplyEntries().map((entry) => ({
        projectName: entry.projectName,
        companyName: entry.companyName,
      })),
    );
    expect(manifest.personReview[0]?.sourceValue).toBe("Nigel Benjamin");
    expect(manifest.hold.map((item) => item.projectName)).toEqual([
      "Collex-Bossy",
      "Defne",
      "Jardins Pala",
      "Rubix",
      "Versoix",
    ]);
    expect(manifest.noProject[0]?.projectName).toBe("Payerne-Envergure");
  });
});

describe("exact project matching", () => {
  it("matches exact names including diacritics-insensitive identity, not aliases", () => {
    const projects = [
      project("Avant-Scène"),
      project("Résidence Symbiose"),
      project("Le Parc des Crêts"),
      project("Eleven 41"),
    ];

    expect(matchExactProjects(projects, "Avant-Scene").map((item) => item.name)).toEqual([
      "Avant-Scène",
    ]);
    expect(matchExactProjects(projects, "Residence Symbiose").map((item) => item.name)).toEqual([
      "Résidence Symbiose",
    ]);
    expect(matchExactProjects(projects, "Symbiose")).toEqual([]);
    expect(matchExactProjects(projects, "1141")).toEqual([]);
    expect(matchExactProjects(projects, "Parc des Crêts")).toEqual([]);
  });

  it("treats two CRM rows with the same exact name as a uniqueness conflict", () => {
    const projects = [project("Arbora", { id: "a1" }), project("Arbora", { id: "a2" })];
    const decision = decideWorkbookCompanyLink({
      entry: WORKBOOK_COMPANY_MAPPING.find((entry) => entry.key === "arbora")!,
      projects,
    });
    expect(decision.action).toBe("conflict");
    expect(decision.reason).toBe("ambiguous_project_name");
  });
});

describe("workbook company decisions", () => {
  const applyProjects = workbookCompanyApplyEntries().map((entry) => project(entry.projectName));

  it("applies billed/linked developer relations for unique exact matches", () => {
    const companies = new Map([
      [normalizeCompanyNameKey("Losinger Marazzi SA"), "co-losinger"],
    ]);
    const decision = decideWorkbookCompanyLink({
      entry: WORKBOOK_COMPANY_MAPPING.find((entry) => entry.key === "arbora")!,
      projects: applyProjects,
      resolvedCompanyId: companies.get(normalizeCompanyNameKey("Losinger Marazzi SA")),
      companyAlreadyExists: true,
    });

    expect(decision.action).toBe("apply");
    expect(decision.reason).toBe("exact_project_and_company");
    expect(decision.companyName).toBe("Losinger Marazzi SA");
    expect(decision.willCreateCompany).toBe(false);
  });

  it("never overwrites an existing primary company", () => {
    const decision = decideWorkbookCompanyLink({
      entry: WORKBOOK_COMPANY_MAPPING.find((entry) => entry.key === "arbora")!,
      projects: [
        project("Arbora", {
          companies: [{ companyId: "manual-1", role: "developer", isPrimary: true }],
        }),
      ],
      resolvedCompanyId: "co-losinger",
      companyAlreadyExists: true,
    });

    expect(decision.action).toBe("conflict");
    expect(decision.reason).toBe("existing_primary_company_preserved");
    expect(decision.existingPrimaryCompanyId).toBe("manual-1");
  });

  it("skips when the exact primary company is already linked", () => {
    const decision = decideWorkbookCompanyLink({
      entry: WORKBOOK_COMPANY_MAPPING.find((entry) => entry.key === "v77")!,
      projects: [
        project("V77", {
          companies: [{ companyId: "co-swissroc", role: "developer", isPrimary: true }],
        }),
      ],
      resolvedCompanyId: "co-swissroc",
      companyAlreadyExists: true,
    });

    expect(decision.action).toBe("already_linked");
  });

  it("holds multi-company rows and Grosvenor / Nigel Benjamin without creating a company", () => {
    const projects = [
      ...applyProjects,
      project("Grosvenor Vistas"),
      project("Collex-Bossy"),
      project("Defne"),
      project("Jardins Pala"),
      project("Rubix"),
      project("Versoix"),
      project("Payerne-Envergure"),
    ];

    const decisions = decideWorkbookCompanyCatalog(projects);
    const byKey = Object.fromEntries(decisions.map((item) => [item.entry.key, item]));

    expect(byKey["grosvenor-vistas"]?.action).toBe("person_review");
    expect(byKey["grosvenor-vistas"]?.sourceValue).toBe("Nigel Benjamin");
    expect(byKey["grosvenor-vistas"]?.willCreateCompany).toBe(false);
    expect(byKey["collex-bossy"]?.action).toBe("hold");
    expect(byKey["collex-bossy"]?.candidates).toEqual([
      "Swissroc Properties SA",
      "M3 Real Estate",
    ]);
    expect(byKey["defne"]?.action).toBe("hold");
    expect(byKey["jardins-pala"]?.action).toBe("hold");
    expect(byKey["rubix"]?.action).toBe("hold");
    expect(byKey["versoix"]?.action).toBe("hold");
    expect(byKey["payerne-envergure"]?.action).toBe("unresolved");
    expect(byKey["payerne-envergure"]?.reason).toBe("no_exact_project_match");
    expect(byKey["payerne-envergure"]?.project).toBeNull();

    expect(decisions.filter((item) => item.action === "apply")).toHaveLength(20);
    expect(decisions.some((item) => item.companyName === "Nigel Benjamin")).toBe(false);
  });

  it("does not apply a hold or person-review row even when a company id is supplied", () => {
    const hold = decideWorkbookCompanyLink({
      entry: WORKBOOK_COMPANY_MAPPING.find((entry) => entry.key === "rubix")!,
      projects: [project("Rubix")],
      resolvedCompanyId: "co-halter",
      companyAlreadyExists: true,
    });
    expect(hold.action).toBe("hold");

    const person = decideWorkbookCompanyLink({
      entry: WORKBOOK_COMPANY_MAPPING.find((entry) => entry.key === "grosvenor-vistas")!,
      projects: [project("Grosvenor Vistas")],
      resolvedCompanyId: "should-not-use",
    });
    expect(person.action).toBe("person_review");
  });
});

describe("billed/linked attachment and verification", () => {
  it("sets the developer/client primary without claiming ownership and keeps secondaries", () => {
    const provenance = billedLinkedProvenance("2026-08-30T18:00:00.000Z");
    const next = attachBilledLinkedPrimary(
      [{ companyId: "partner-1", role: "marketing_sales_partner", isPrimary: false }],
      "co-losinger",
      provenance,
    );

    expect(verifyBilledLinkedPrimary(next, "co-losinger")).toBe(true);
    expect(next).toEqual([
      {
        companyId: "co-losinger",
        role: "developer",
        isPrimary: true,
        provenance,
      },
      {
        companyId: "partner-1",
        role: "marketing_sales_partner",
        isPrimary: false,
      },
    ]);
    expect(next[0]?.provenance?.relationship).toBe("billed_linked");
    expect(next[0]?.provenance?.notes).toMatch(/does not claim legal ownership/i);
    expect(next.some((item) => item.role === "owner")).toBe(false);
  });

  it("blocks writes when the project is not unique or a primary company already exists", () => {
    expect(
      confirmWorkbookWriteGuards({
        activeExactMatches: 2,
        latestPrimaryCompanyId: null,
        targetCompanyId: "co-1",
      }),
    ).toEqual({
      proceed: false,
      action: "conflict",
      reason: "project_uniqueness_failed_before_write",
    });
    expect(
      confirmWorkbookWriteGuards({
        activeExactMatches: 1,
        latestPrimaryCompanyId: "manual-1",
        targetCompanyId: "co-1",
      }),
    ).toEqual({
      proceed: false,
      action: "conflict",
      reason: "existing_primary_company_preserved",
    });
    expect(
      confirmWorkbookWriteGuards({
        activeExactMatches: 1,
        latestPrimaryCompanyId: null,
        targetCompanyId: "co-1",
      }),
    ).toEqual({ proceed: true });
  });

  it("verifies the post-write primary company id", () => {
    const written = attachBilledLinkedPrimary(
      [],
      "co-losinger",
      billedLinkedProvenance("2026-08-30T18:00:00.000Z"),
    );
    expect(verifyBilledLinkedPrimary(written, "co-losinger")).toBe(true);
    expect(verifyBilledLinkedPrimary(written, "someone-else")).toBe(false);
  });

  it("reuses one normalized company name across Mathod and Résidence Symbiose", () => {
    expect(normalizeCompanyNameKey("NewHome Services SA")).toBe("newhome services sa");
    expect(normalizeCompanyNameKey("  NewHome   Services SA ")).toBe("newhome services sa");
  });
});
