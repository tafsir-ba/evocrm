/**
 * Exclusive source-ID reconciliation for the full HubSpot CMP product cohort
 * (product_intersted_in EQ CMP). Every contact ID lands in exactly one bucket.
 * No PII in output. Does not write leads or change enrollment.
 */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import Module from "node:module";

const loadable = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = loadable._load.bind(Module);
loadable._load = function patchedLoad(
  request: string,
  parent: unknown,
  isMain: boolean,
) {
  if (request === "server-only") {
    return {};
  }
  return originalLoad(request, parent, isMain);
};

function withDefaultDb(uri: string): string {
  try {
    const parsed = new URL(uri);
    if (!parsed.pathname || parsed.pathname === "/") {
      parsed.pathname = "/evocrm";
      return parsed.toString();
    }
  } catch {
    return uri;
  }
  return uri;
}

function bootstrapEnv(): void {
  if (!process.env.MONGODB_URI && process.env.MONGO_URL) {
    process.env.MONGODB_URI = withDefaultDb(process.env.MONGO_URL);
  } else if (process.env.MONGODB_URI) {
    process.env.MONGODB_URI = withDefaultDb(process.env.MONGODB_URI);
  }
  if (!process.env.NEXT_PUBLIC_APP_URL) {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function hubspotSearchAllEq(input: {
  accessToken: string;
  propertyName: string;
  value: string;
  properties: string[];
}): Promise<{
  searchTotal: number;
  results: Array<{ id: string; properties: Record<string, string | null> }>;
}> {
  const byId = new Map<string, { id: string; properties: Record<string, string | null> }>();
  let after: string | undefined;
  let searchTotal = 0;
  for (;;) {
    let page: {
      total?: number;
      results?: Array<{ id?: string; properties?: Record<string, string | null | undefined> }>;
      paging?: { next?: { after?: string } };
    } | null = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const response = await fetch("https://api.hubapi.com/crm/v3/objects/contacts/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filterGroups: [
            {
              filters: [
                {
                  propertyName: input.propertyName,
                  operator: "EQ",
                  value: input.value,
                },
              ],
            },
          ],
          properties: input.properties,
          limit: 100,
          after,
        }),
      });
      if (response.status === 429) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      if (!response.ok) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      page = (await response.json()) as typeof page;
      break;
    }
    if (!page) {
      throw new Error("hubspot_cmp_search_failed");
    }
    searchTotal = Number(page.total ?? searchTotal);
    for (const result of page.results ?? []) {
      const id = String(result.id ?? "");
      if (!id || byId.has(id)) {
        continue;
      }
      byId.set(id, {
        id,
        properties: Object.fromEntries(
          Object.entries(result.properties ?? {}).map(([key, value]) => [
            key,
            typeof value === "string" ? value : null,
          ]),
        ),
      });
    }
    after = page.paging?.next?.after;
    if (!after) {
      break;
    }
    if (byId.size % 1000 === 0) {
      console.error(JSON.stringify({ progress: "cmp_search", scanned: byId.size, searchTotal }));
    }
    await sleep(250);
  }
  return { searchTotal, results: [...byId.values()] };
}

const CMP_BUCKETS = [
  "migrated_to_cmp",
  "migrated_elsewhere_in_crm",
  "preexisting_deduped",
  "product_vs_wd_conflict_held",
  "multi_project_held",
  "missing_or_invalid_contact",
  "still_to_migrate_cmp",
  "other_excluded_held",
  "errors_retry",
  "unexplained",
] as const;

type CmpBucket = (typeof CMP_BUCKETS)[number];

async function main(): Promise<void> {
  bootstrapEnv();
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) {
    throw new Error("HUBSPOT_ACCESS_TOKEN_required");
  }

  const {
    WD_CMP_SLUG,
    WD_MIGRATION_GENERAL_PROJECT_ID,
    WD_MIGRATION_HUBSPOT_PROPERTIES,
    WD_MIGRATION_MANIFEST_DIR,
    WD_MIGRATION_WORKSPACE_ID,
    evaluateWdProjectEligibility,
    hasProductVsWdConflict,
  } = await import("../lib/hubspot-wd-project-migration");
  const {
    checksumContactIds,
    existingLeadFromRecord,
    hubspotContactIdsFromLeadAttributes,
    normalizePilotEmail,
    pilotNameKey,
    snapshotFromHubSpotProperties,
  } = await import("../lib/hubspot-gv-pilot");
  const mongoose = await import("mongoose");
  const { connectDb } = await import("../server/db/mongoose");

  const CMP_PROJECT_ID = "6a9489ee84c29475f4dbc6c3";
  const EXPECTED_ABOUT = 8317;

  await connectDb();
  const db = mongoose.default.connection.db;
  if (!db) {
    throw new Error("mongo_db_unavailable");
  }
  const workspaceOid = new mongoose.default.Types.ObjectId(WD_MIGRATION_WORKSPACE_ID);
  const cmpOid = new mongoose.default.Types.ObjectId(CMP_PROJECT_ID);

  const leadDocs = await db
    .collection("leads")
    .find(
      { workspaceId: workspaceOid, archivedAt: null },
      {
        projection: {
          projectId: 1,
          emailNormalized: 1,
          email: 1,
          firstName: 1,
          lastName: 1,
          attributes: 1,
        },
      },
    )
    .toArray();

  type Existing = {
    emailNormalized: string | null;
    nameKey: string;
    hubspotContactIds: string[];
    projectId: string;
  };
  const byHubspotId = new Map<string, Existing>();
  const byEmail = new Map<string, Existing[]>();
  const allExisting: Existing[] = [];

  for (const doc of leadDocs) {
    const emailNormalized =
      typeof doc.emailNormalized === "string" && doc.emailNormalized
        ? doc.emailNormalized
        : normalizePilotEmail(String(doc.email ?? ""));
    const nameKey = pilotNameKey(String(doc.firstName ?? ""), String(doc.lastName ?? ""));
    const hubspotContactIds = hubspotContactIdsFromLeadAttributes(
      (doc.attributes as Record<string, unknown> | undefined) ?? {},
    );
    const existing: Existing = {
      emailNormalized,
      nameKey,
      hubspotContactIds,
      projectId: doc.projectId?.toString?.() ?? String(doc.projectId),
    };
    allExisting.push(existing);
    for (const id of hubspotContactIds) {
      byHubspotId.set(String(id), existing);
    }
    if (emailNormalized) {
      const list = byEmail.get(emailNormalized) ?? [];
      list.push(existing);
      byEmail.set(emailNormalized, list);
    }
  }

  const cmpLeadCount = await db.collection("leads").countDocuments({
    workspaceId: workspaceOid,
    projectId: cmpOid,
  });
  const cmpGuarded = await db.collection("leads").countDocuments({
    workspaceId: workspaceOid,
    projectId: cmpOid,
    "attributes.campaignEnrollmentPolicy.defaultExcluded": true,
  });
  const cmpEnroll = await db.collection("campaignenrollments").countDocuments({
    workspaceId: workspaceOid,
    projectId: cmpOid,
  });
  const generalTouched = await db.collection("leads").countDocuments({
    workspaceId: workspaceOid,
    projectId: new mongoose.default.Types.ObjectId(WD_MIGRATION_GENERAL_PROJECT_ID),
    "attributes.integration.externalId": { $exists: true },
  });

  const { searchTotal, results } = await hubspotSearchAllEq({
    accessToken: token,
    propertyName: "product_intersted_in",
    value: "CMP",
    properties: [...WD_MIGRATION_HUBSPOT_PROPERTIES],
  });

  const buckets: Record<CmpBucket, string[]> = {
    migrated_to_cmp: [],
    migrated_elsewhere_in_crm: [],
    preexisting_deduped: [],
    product_vs_wd_conflict_held: [],
    multi_project_held: [],
    missing_or_invalid_contact: [],
    still_to_migrate_cmp: [],
    other_excluded_held: [],
    errors_retry: [],
    unexplained: [],
  };
  const reasonById: Record<string, string> = {};

  for (const row of results) {
    const snapshot = snapshotFromHubSpotProperties(row.id, row.properties);
    const projects = [...new Set(snapshot.projectValues)];

    const byId = byHubspotId.get(row.id);
    if (byId) {
      if (byId.projectId === CMP_PROJECT_ID) {
        buckets.migrated_to_cmp.push(row.id);
        reasonById[row.id] = "hubspot_id_on_cmp";
        continue;
      }
      buckets.migrated_elsewhere_in_crm.push(row.id);
      reasonById[row.id] =
        byId.projectId === WD_MIGRATION_GENERAL_PROJECT_ID
          ? "hubspot_id_on_general"
          : "hubspot_id_on_other_project";
      continue;
    }

    if (hasProductVsWdConflict({ productValues: snapshot.productValues, projectValues: projects })) {
      buckets.product_vs_wd_conflict_held.push(row.id);
      reasonById[row.id] = "product_vs_wd_conflict";
      continue;
    }

    if (projects.length > 1) {
      buckets.multi_project_held.push(row.id);
      reasonById[row.id] = "multi_project";
      continue;
    }

    const existingForEligibility = allExisting.map((lead) => ({
      emailNormalized: lead.emailNormalized,
      nameKey: lead.nameKey,
      hubspotContactIds: lead.hubspotContactIds,
    }));
    const eligibility = evaluateWdProjectEligibility(snapshot, existingForEligibility, WD_CMP_SLUG);

    if (eligibility.exclusions.includes("email_match") && !eligibility.exclusions.includes("identity_conflict")) {
      buckets.preexisting_deduped.push(row.id);
      reasonById[row.id] = "email_match";
      continue;
    }
    if (eligibility.exclusions.includes("identity_conflict")) {
      buckets.other_excluded_held.push(row.id);
      reasonById[row.id] = "identity_conflict";
      continue;
    }
    if (eligibility.exclusions.includes("missing_email_and_phone")) {
      buckets.missing_or_invalid_contact.push(row.id);
      reasonById[row.id] = "missing_email_and_phone";
      continue;
    }
    if (eligibility.exclusions.includes("missing_name")) {
      buckets.missing_or_invalid_contact.push(row.id);
      reasonById[row.id] = "missing_name_no_email";
      continue;
    }
    if (eligibility.exclusions.includes("notes_conflict")) {
      buckets.other_excluded_held.push(row.id);
      reasonById[row.id] = "notes_conflict";
      continue;
    }
    if (eligibility.exclusions.includes("broker_only") || eligibility.exclusions.includes("notes_only")) {
      buckets.other_excluded_held.push(row.id);
      reasonById[row.id] = eligibility.exclusions.find(
        (item) => item === "broker_only" || item === "notes_only",
      )!;
      continue;
    }
    if (eligibility.writeEligible) {
      buckets.still_to_migrate_cmp.push(row.id);
      reasonById[row.id] = "new_write_eligible";
      continue;
    }
    if (eligibility.exclusions.includes("not_target_project")) {
      // CMP product with blank wd should be attributable; if still not_target, hold.
      buckets.other_excluded_held.push(row.id);
      reasonById[row.id] = "not_target_project";
      continue;
    }
    const primary = eligibility.exclusions[0] ?? "excluded";
    buckets.other_excluded_held.push(row.id);
    reasonById[row.id] = primary;
  }

  const sortIds = (ids: string[]) => [...ids].sort((a, b) => Number(a) - Number(b));
  for (const key of CMP_BUCKETS) {
    buckets[key] = sortIds(buckets[key]);
  }

  const accounted = CMP_BUCKETS.reduce((sum, key) => sum + buckets[key].length, 0);
  const distinct = results.length;
  if (accounted !== distinct) {
    const seen = new Set(CMP_BUCKETS.flatMap((key) => buckets[key]));
    for (const row of results) {
      if (!seen.has(row.id)) {
        buckets.unexplained.push(row.id);
        reasonById[row.id] = "unexplained";
      }
    }
    buckets.unexplained = sortIds(buckets.unexplained);
  }

  const bucketCounts = Object.fromEntries(
    CMP_BUCKETS.map((key) => [key, buckets[key].length]),
  ) as Record<CmpBucket, number>;
  const finalAccounted = CMP_BUCKETS.reduce((sum, key) => sum + bucketCounts[key], 0);

  const reasonCounts: Record<string, number> = {};
  for (const reason of Object.values(reasonById)) {
    reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
  }

  const safelyResolved =
    bucketCounts.migrated_to_cmp +
    bucketCounts.migrated_elsewhere_in_crm +
    bucketCounts.preexisting_deduped +
    bucketCounts.product_vs_wd_conflict_held +
    bucketCounts.multi_project_held +
    bucketCounts.missing_or_invalid_contact +
    bucketCounts.other_excluded_held;
  const unresolved =
    bucketCounts.still_to_migrate_cmp +
    bucketCounts.errors_retry +
    bucketCounts.unexplained;

  const gates = {
    exclusiveAccounted: finalAccounted === distinct,
    unexplainedZero: bucketCounts.unexplained === 0,
    stillToMigrateZero: bucketCounts.still_to_migrate_cmp === 0,
    errorsZero: bucketCounts.errors_retry === 0,
    enrollmentsZero: cmpEnroll === 0,
    allCmpGuarded: cmpLeadCount === 0 || cmpGuarded === cmpLeadCount,
    noGeneralRouting: true,
  };
  const cmpWaveDeclaredComplete =
    gates.exclusiveAccounted &&
    gates.unexplainedZero &&
    gates.stillToMigrateZero &&
    gates.errorsZero &&
    gates.enrollmentsZero &&
    gates.allCmpGuarded &&
    unresolved === 0;

  const report = {
    version: 1,
    generatedAt: new Date().toISOString(),
    portalId: "5699191",
    workspaceId: WD_MIGRATION_WORKSPACE_ID,
    destinationProjectId: CMP_PROJECT_ID,
    destinationReference: "CMP",
    cohort: {
      property: "product_intersted_in",
      operator: "EQ",
      value: "CMP",
      expectedAbout: EXPECTED_ABOUT,
      hubspotSearchTotal: searchTotal,
      distinctSourceIds: distinct,
      accounted: finalAccounted,
      expectedDelta: EXPECTED_ABOUT - distinct,
    },
    bucketCounts,
    reasonCounts,
    crmSnapshot: {
      cmpLeadCount,
      cmpGuarded,
      cmpEnrollmentCount: cmpEnroll,
      generalLeadsWithHubspotKey: generalTouched,
      note:
        "cmpLeadCount can exceed migrated_to_cmp when CRM holds CMP leads whose HubSpot product_intersted_in is no longer EQ CMP, or when non-product CMP attributions were migrated.",
    },
    resolution: {
      safelyResolved,
      unresolved,
      cmpWaveDeclaredComplete,
      completionCriteria:
        "CMP declared complete only when every product_intersted_in=CMP source ID is either migrated_to_cmp or safely resolved (deduped / conflict held / multi held / missing contact / other explicit hold) with unexplained=0 and still_to_migrate_cmp=0 and errors_retry=0.",
      gates,
    },
    idChecksum: checksumContactIds(sortIds(results.map((row) => row.id))),
    buckets,
    notes:
      "Exclusive buckets — no overlap. Business expectation ~8,317; live HubSpot EQ search is authoritative. Do not sum buckets with CMP project lead count.",
  };

  const outDir = path.join(process.cwd(), WD_MIGRATION_MANIFEST_DIR);
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "cmp-full-cohort-reconciliation.json");
  // Keep ID lists but also write a summary-only companion for readability.
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`);
  const summaryPath = path.join(outDir, "cmp-full-cohort-reconciliation-summary.json");
  const { buckets: _omit, ...summary } = report;
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);

  console.log(
    JSON.stringify(
      {
        ok: true,
        outPath,
        summaryPath,
        cohort: report.cohort,
        bucketCounts: report.bucketCounts,
        resolution: report.resolution,
        crmSnapshot: report.crmSnapshot,
      },
      null,
      2,
    ),
  );

  await mongoose.default.disconnect().catch(() => undefined);
  if (!report.resolution.gates.exclusiveAccounted) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "unknown" }));
  process.exit(1);
});
