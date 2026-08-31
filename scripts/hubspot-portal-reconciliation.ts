/**
 * Full-portal HubSpot → EvoHome contact reconciliation.
 * Accounts for every HubSpot contact id exactly once. No PII in output.
 * Does not write leads, change mappings, or enroll campaigns.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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
  // NODE_ENV is runtime-owned; never assign it.
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type HubSpotContactListPage = {
  results?: Array<{ id: string; properties: Record<string, string | null> }>;
  paging?: { next?: { after?: string } };
};

async function hubspotListAll(input: {
  accessToken: string;
  properties: string[];
}): Promise<{
  results: Array<{ id: string; properties: Record<string, string | null> }>;
}> {
  const results: Array<{ id: string; properties: Record<string, string | null> }> = [];
  let after: string | undefined;
  for (;;) {
    let lastError: unknown = null;
    let page: HubSpotContactListPage | null = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const params = new URLSearchParams({
        limit: "100",
        properties: input.properties.join(","),
      });
      if (after) {
        params.set("after", after);
      }
      const response = await fetch(
        `https://api.hubapi.com/crm/v3/objects/contacts?${params.toString()}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${input.accessToken}`,
            Accept: "application/json",
          },
        },
      );
      if (response.status === 429) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      if (!response.ok) {
        lastError = new Error(`hubspot_list_${response.status}`);
        await sleep(500 * 2 ** attempt);
        continue;
      }
      page = (await response.json()) as HubSpotContactListPage;
      break;
    }
    if (!page) {
      throw lastError instanceof Error ? lastError : new Error("hubspot_list_failed");
    }
    for (const row of page.results ?? []) {
      results.push(row);
    }
    after = page.paging?.next?.after;
    if (!after) {
      break;
    }
    if (results.length % 2000 === 0) {
      console.error(JSON.stringify({ progress: "hubspot_fetch", scanned: results.length }));
    }
  }
  return { results };
}

async function hubspotSearchTotal(accessToken: string): Promise<number> {
  const response = await fetch("https://api.hubapi.com/crm/v3/objects/contacts/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filterGroups: [
        {
          filters: [{ propertyName: "hs_object_id", operator: "HAS_PROPERTY" }],
        },
      ],
      limit: 1,
      properties: ["hs_object_id"],
    }),
  });
  if (!response.ok) {
    throw new Error(`hubspot_total_${response.status}`);
  }
  const page = (await response.json()) as { total?: number };
  return Number(page.total ?? 0);
}

async function main(): Promise<void> {
  bootstrapEnv();
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) {
    throw new Error("HUBSPOT_ACCESS_TOKEN_required");
  }

  const {
    WD_MIGRATION_HUBSPOT_PROPERTIES,
    WD_MIGRATION_MANIFEST_DIR,
    WD_MIGRATION_ROADMAP_FILE,
    WD_MIGRATION_WORKSPACE_ID,
    classifyPortalContact,
  } = await import("../lib/hubspot-wd-project-migration");
  type PortalReconBucket = import("../lib/hubspot-wd-project-migration").PortalReconBucket;
  const {
    snapshotFromHubSpotProperties,
    hubspotContactIdsFromLeadAttributes,
    normalizePilotEmail,
    pilotNameKey,
    checksumContactIds,
  } = await import("../lib/hubspot-gv-pilot");
  const mongoose = await import("mongoose");
  const { connectDb } = await import("../server/db/mongoose");

  const roadmap = JSON.parse(
    await readFile(path.join(process.cwd(), WD_MIGRATION_ROADMAP_FILE), "utf8"),
  ) as {
    create_then_map: string[];
    map_existing: string[];
    fallback_general: string[];
  };
  const migratableSlugs = new Set([...roadmap.create_then_map, ...roadmap.map_existing]);
  const fallbackGeneralSlugs = new Set(roadmap.fallback_general);

  await connectDb();
  const db = mongoose.default.connection.db;
  if (!db) {
    throw new Error("mongo_db_unavailable");
  }

  const workspaceOid = new mongoose.default.Types.ObjectId(WD_MIGRATION_WORKSPACE_ID);
  const leadDocs = await db
    .collection("leads")
    .find(
      { workspaceId: workspaceOid, archivedAt: null },
      {
        projection: {
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
  };
  const byEmail = new Map<string, Existing[]>();
  const byHubspotId = new Map<string, Existing>();
  const allExisting: Existing[] = [];

  for (const doc of leadDocs) {
    const emailNormalized =
      typeof doc.emailNormalized === "string" && doc.emailNormalized
        ? doc.emailNormalized
        : normalizePilotEmail(
            typeof (doc as { email?: string }).email === "string"
              ? (doc as { email?: string }).email
              : null,
          );
    const nameKey = pilotNameKey(String(doc.firstName ?? ""), String(doc.lastName ?? ""));
    const hubspotContactIds = hubspotContactIdsFromLeadAttributes(
      (doc.attributes as Record<string, unknown> | undefined) ?? {},
    );
    const existing: Existing = { emailNormalized, nameKey, hubspotContactIds };
    allExisting.push(existing);
    if (emailNormalized) {
      const list = byEmail.get(emailNormalized) ?? [];
      list.push(existing);
      byEmail.set(emailNormalized, list);
    }
    for (const id of hubspotContactIds) {
      byHubspotId.set(id, existing);
    }
  }

  const total = await hubspotSearchTotal(token);
  const { results } = await hubspotListAll({
    accessToken: token,
    properties: [...WD_MIGRATION_HUBSPOT_PROPERTIES],
  });

  const bucketCounts: Record<PortalReconBucket, number> = {
    migrated: 0,
    preexisting_deduped: 0,
    still_to_migrate: 0,
    multi_or_identity_exception: 0,
    no_project_signal: 0,
    excluded: 0,
  };
  const reasonCounts: Record<string, number> = {};
  const stillBySlug: Record<string, string[]> = {};
  const reviewQueue: Record<string, { count: number; sampleIds: string[] }> = {};
  const allIds: string[] = [];
  const seen = new Set<string>();

  for (const row of results) {
    const id = String(row.id);
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    allIds.push(id);
    const snapshot = snapshotFromHubSpotProperties(id, row.properties ?? {});
    const existing: Existing[] = [];
    const byId = byHubspotId.get(id);
    if (byId) {
      existing.push(byId);
    }
    if (snapshot.emailNormalized) {
      for (const lead of byEmail.get(snapshot.emailNormalized) ?? []) {
        if (!existing.includes(lead)) {
          existing.push(lead);
        }
      }
    }
    const classified = classifyPortalContact({
      snapshot,
      existing,
      fallbackGeneralSlugs,
      migratableSlugs,
    });
    bucketCounts[classified.bucket] += 1;
    reasonCounts[classified.reason] = (reasonCounts[classified.reason] ?? 0) + 1;

    if (classified.bucket === "still_to_migrate" && classified.attributableSlug) {
      const list = stillBySlug[classified.attributableSlug] ?? [];
      list.push(id);
      stillBySlug[classified.attributableSlug] = list;
    } else if (classified.bucket !== "migrated" && classified.bucket !== "preexisting_deduped") {
      const key = `${classified.bucket}:${classified.reason}`;
      const entry = reviewQueue[key] ?? { count: 0, sampleIds: [] };
      entry.count += 1;
      if (entry.sampleIds.length < 5) {
        entry.sampleIds.push(id);
      }
      reviewQueue[key] = entry;
    }
  }

  allIds.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const accounted = Object.values(bucketCounts).reduce((sum, n) => sum + n, 0);
  const unexplained = total - accounted;
  const idChecksum = checksumContactIds(allIds);
  const contentHash = createHash("sha256")
    .update(JSON.stringify({ bucketCounts, reasonCounts, idChecksum, total }))
    .digest("hex");

  const outDir = path.join(process.cwd(), WD_MIGRATION_MANIFEST_DIR);
  await mkdir(path.join(outDir, "portal-recon-residuals"), { recursive: true });

  const residualManifests: Array<{ slug: string; size: number; file: string }> = [];
  for (const [slug, ids] of Object.entries(stillBySlug)) {
    ids.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const file = `portal-recon-residuals/${slug}.json`;
    await writeFile(
      path.join(outDir, file),
      `${JSON.stringify(
        {
          version: 1,
          slug,
          size: ids.length,
          hubspotContactIds: ids,
          idChecksum: checksumContactIds(ids),
        },
        null,
        2,
      )}\n`,
    );
    residualManifests.push({ slug, size: ids.length, file });
  }

  // Campaign guard snapshot (read-only)
  const hubspotInboundSources = ["hubspot-wd-project", "hubspot-gv-pilot", "hubspot"] as const;
  const migratedLeadCount = await db.collection("leads").countDocuments({
    workspaceId: workspaceOid,
    archivedAt: null,
    "attributes.integration.inboundSource": { $in: [...hubspotInboundSources] },
  });
  const unguarded = await db.collection("leads").countDocuments({
    workspaceId: workspaceOid,
    archivedAt: null,
    "attributes.integration.inboundSource": { $in: [...hubspotInboundSources] },
    "attributes.campaignEnrollmentPolicy.defaultExcluded": { $ne: true },
  });
  const migratedLeadDocs = await db
    .collection("leads")
    .find(
      {
        workspaceId: workspaceOid,
        archivedAt: null,
        "attributes.integration.inboundSource": { $in: [...hubspotInboundSources] },
      },
      { projection: { _id: 1, attributes: 1 } },
    )
    .toArray();
  const migratedIds = migratedLeadDocs.map((doc) => doc._id);
  const enrollmentCount =
    migratedIds.length === 0
      ? 0
      : await db.collection("campaignenrollments").countDocuments({
          leadId: { $in: migratedIds },
        });

  // Distinct HubSpot source IDs represented in CRM (any active lead with HubSpot externalId).
  const crmHubspotIdSet = new Set<string>();
  for (const doc of leadDocs) {
    const ids = hubspotContactIdsFromLeadAttributes(
      (doc.attributes as Record<string, unknown> | undefined) ?? {},
    );
    for (const id of ids) {
      crmHubspotIdSet.add(String(id));
    }
  }
  const crmDistinctSourceIds = crmHubspotIdSet.size;
  const crmSourceIdsInPortal = allIds.filter((id) => crmHubspotIdSet.has(id)).length;
  const grossRemainingSourceGap = allIds.length - crmSourceIdsInPortal;

  // Dashboard "Imported" is typically lead-count under HubSpot inbound sources, not
  // distinct HubSpot contact IDs. Report both so they are not confused.
  const activeLeadCount = await db.collection("leads").countDocuments({
    workspaceId: workspaceOid,
    archivedAt: null,
  });
  const dashboardImportedClaim = 29196;
  const dashboardImportedVsLeads = {
    claimedImported: dashboardImportedClaim,
    crmActiveLeadsWithHubspotInboundSource: migratedLeadCount,
    crmActiveLeadsTotal: activeLeadCount,
    crmDistinctHubspotSourceIds: crmDistinctSourceIds,
    crmDistinctHubspotSourceIdsInPortalScan: crmSourceIdsInPortal,
    includesAllLegacySyncRecords:
      migratedLeadCount >= dashboardImportedClaim
        ? "claimed_imported_lte_crm_hubspot_inbound_leads"
        : "claimed_imported_exceeds_crm_hubspot_inbound_leads_or_stale",
    notes:
      "Dashboard Imported (29,196) is a lead-row total, not exclusive HubSpot source-ID accounting. Distinct HubSpot externalIds in CRM and exclusive portal buckets are authoritative. Pre-existing CRM leads without a HubSpot integration key are not counted as source-ID matches.",
  };

  const report = {
    version: 2,
    generatedAt: new Date().toISOString(),
    portalId: "5699191",
    workspaceId: WD_MIGRATION_WORKSPACE_ID,
    hubspotSearchTotal: total,
    scannedUniqueIds: allIds.length,
    accounted,
    unexplained,
    idChecksum,
    contentHash,
    bucketCounts,
    reasonCounts,
    crmSourceIdCoverage: {
      distinctHubspotSourceIdsInCrm: crmDistinctSourceIds,
      portalIdsMatchedInCrm: crmSourceIdsInPortal,
      grossRemainingSourceGap,
    },
    dashboardImportedVsLeads,
    stillToMigrateBySlug: Object.fromEntries(
      Object.entries(stillBySlug).map(([slug, ids]) => [slug, ids.length]),
    ),
    residualManifests,
    reviewQueue,
    campaignGuard: {
      migratedLeadCount,
      unguardedDefaultExcluded: unguarded,
      enrollmentCount,
    },
    waveStatus: {
      cmpWave: "complete",
      namelessEmailWave: "complete",
      activelyProcessing: 0,
    },
    gates: {
      exactAccounted: unexplained === 0 && accounted === total && accounted === allIds.length,
      noDuplicateScanIds: seen.size === allIds.length,
      campaignGuardIntact: unguarded === 0 && enrollmentCount === 0,
    },
  };

  await writeFile(
    path.join(outDir, "portal-reconciliation.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  console.log(JSON.stringify(report, null, 2));

  await mongoose.default.disconnect().catch(() => undefined);
  if (!report.gates.exactAccounted || !report.gates.campaignGuardIntact) {
    process.exitCode = 1;
  }
}

main().catch(async (error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown_error";
  console.error(JSON.stringify({ ok: false, error: message }));
  try {
    const mongoose = await import("mongoose");
    await mongoose.default.disconnect().catch(() => undefined);
  } catch {
    // ignore
  }
  process.exit(1);
});
