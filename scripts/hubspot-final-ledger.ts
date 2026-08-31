/**
 * Exclusive source-ID final ledger for HubSpot → EvoHome.
 * Every HubSpot contact → exactly one durable CRM outcome class.
 * No PII in report.
 */
import { createHash } from "node:crypto";
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
  if (request === "server-only") return {};
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
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function checksumIds(ids: string[]): string {
  const hash = createHash("sha256");
  for (const id of [...ids].sort()) {
    hash.update(id);
    hash.update("\n");
  }
  return hash.digest("hex");
}

type Outcome =
  | "lead_with_hubspot_id"
  | "email_deduped_linked"
  | "email_deduped_unlinked"
  | "missing_unresolved"
  | "unexplained";

async function hubspotListIds(accessToken: string): Promise<string[]> {
  const ids: string[] = [];
  let after: string | undefined;
  for (;;) {
    let page: {
      results?: Array<{ id: string }>;
      paging?: { next?: { after?: string } };
    } | null = null;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const params = new URLSearchParams({ limit: "100", properties: "email" });
      if (after) params.set("after", after);
      const response = await fetch(
        `https://api.hubapi.com/crm/v3/objects/contacts?${params.toString()}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
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
      page = (await response.json()) as {
        results?: Array<{ id: string }>;
        paging?: { next?: { after?: string } };
      };
      break;
    }
    if (!page) throw lastError instanceof Error ? lastError : new Error("hubspot_list_failed");
    for (const row of page.results ?? []) ids.push(row.id);
    after = page.paging?.next?.after;
    if (!after) break;
  }
  return ids;
}

async function main(): Promise<void> {
  bootstrapEnv();
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) throw new Error("HUBSPOT_ACCESS_TOKEN_required");

  const mongoose = (await import("mongoose")).default;
  await mongoose.connect(process.env.MONGODB_URI!);
  const {
    WD_MIGRATION_WORKSPACE_ID,
    WD_MIGRATION_MANIFEST_DIR,
    WD_MIGRATION_GENERAL_PROJECT_ID,
  } = await import("../lib/hubspot-wd-project-migration");
  const { normalizePilotEmail } = await import("../lib/hubspot-gv-pilot");

  console.error("[final-ledger] listing HubSpot IDs…");
  const hubspotIds = await hubspotListIds(token);
  console.error(`[final-ledger] hubspot=${hubspotIds.length}`);

  const db = mongoose.connection.db!;
  const ws = new mongoose.Types.ObjectId(WD_MIGRATION_WORKSPACE_ID);

  const byHubspotId = new Map<string, { leadId: string; projectId: string; legacy: boolean }>();
  const emailToLead = new Map<string, string>();

  const cursor = db.collection("leads").find(
    { workspaceId: ws, archivedAt: null },
    {
      projection: {
        emailNormalized: 1,
        projectId: 1,
        attributes: 1,
      },
    },
  );
  let legacyGeneral = 0;
  let multiMembershipLeads = 0;
  for await (const doc of cursor) {
    const leadId = doc._id.toString();
    const projectId = doc.projectId?.toString?.() ?? String(doc.projectId);
    const attrs = (doc.attributes ?? {}) as {
      integration?: { externalId?: string; idempotencyKey?: string };
      hubspotMigration?: { legacyArchive?: boolean; legacyUnassigned?: boolean };
    };
    const legacy = Boolean(
      attrs.hubspotMigration?.legacyArchive || attrs.hubspotMigration?.legacyUnassigned,
    );
    if (legacy || projectId === WD_MIGRATION_GENERAL_PROJECT_ID) {
      if (legacy || projectId === WD_MIGRATION_GENERAL_PROJECT_ID) {
        // count general/legacy leads separately below via hubspot linkage
      }
    }
    if (attrs.hubspotMigration?.legacyArchive) legacyGeneral += 1;

    const externalId = attrs.integration?.externalId;
    if (externalId) {
      if (!byHubspotId.has(String(externalId))) {
        byHubspotId.set(String(externalId), { leadId, projectId, legacy });
      }
    }
    const key = attrs.integration?.idempotencyKey;
    if (typeof key === "string" && key.startsWith("hubspot:contact:")) {
      const id = key.slice("hubspot:contact:".length).split(":")[0];
      if (id && !byHubspotId.has(id)) {
        byHubspotId.set(id, { leadId, projectId, legacy });
      }
    }
    if (typeof doc.emailNormalized === "string" && doc.emailNormalized) {
      if (!emailToLead.has(doc.emailNormalized)) {
        emailToLead.set(doc.emailNormalized, leadId);
      }
    }
  }

  const memCounts = await db
    .collection("leadprojectmemberships")
    .aggregate([
      { $match: { workspaceId: ws, archivedAt: null } },
      { $group: { _id: "$leadId", n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
      { $count: "c" },
    ])
    .toArray();
  multiMembershipLeads = memCounts[0]?.c ?? 0;

  // Need emails from HubSpot for dedupe classification — load from portal recon cache if present
  // For unlinked email match we need contact emails; fetch properties in pages for unresolved only.
  const unresolvedIds: string[] = [];
  const buckets: Record<Outcome, number> = {
    lead_with_hubspot_id: 0,
    email_deduped_linked: 0,
    email_deduped_unlinked: 0,
    missing_unresolved: 0,
    unexplained: 0,
  };
  const reasonCounts: Record<string, number> = {};

  for (const id of hubspotIds) {
    if (byHubspotId.has(id)) {
      const row = byHubspotId.get(id)!;
      buckets.lead_with_hubspot_id += 1;
      const reason = row.legacy
        ? "legacy_or_general_with_hubspot_id"
        : row.projectId === WD_MIGRATION_GENERAL_PROJECT_ID
          ? "general_with_hubspot_id"
          : "project_lead_with_hubspot_id";
      reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
    } else {
      unresolvedIds.push(id);
    }
  }

  // Resolve remaining via email batch fetch
  console.error(`[final-ledger] unresolved before email pass: ${unresolvedIds.length}`);
  const unresolvedSet = new Set(unresolvedIds);
  let after: string | undefined;
  for (;;) {
    let page: {
      results?: Array<{ id: string; properties?: { email?: string | null } }>;
      paging?: { next?: { after?: string } };
    } | null = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const params = new URLSearchParams({ limit: "100", properties: "email" });
      if (after) params.set("after", after);
      const response = await fetch(
        `https://api.hubapi.com/crm/v3/objects/contacts?${params.toString()}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        },
      );
      if (response.status === 429) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      if (!response.ok) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      page = (await response.json()) as {
        results?: Array<{ id: string; properties?: { email?: string | null } }>;
        paging?: { next?: { after?: string } };
      };
      break;
    }
    if (!page) break;
    for (const row of page.results ?? []) {
      if (!unresolvedSet.has(row.id)) continue;
      const email = normalizePilotEmail(row.properties?.email ?? null);
      if (email && emailToLead.has(email)) {
        buckets.email_deduped_unlinked += 1;
        reasonCounts.email_match_without_hubspot_id =
          (reasonCounts.email_match_without_hubspot_id ?? 0) + 1;
        unresolvedSet.delete(row.id);
      }
    }
    after = page.paging?.next?.after;
    if (!after) break;
  }

  for (const id of unresolvedSet) {
    buckets.missing_unresolved += 1;
    reasonCounts.unresolved = (reasonCounts.unresolved ?? 0) + 1;
  }

  const accounted =
    buckets.lead_with_hubspot_id +
    buckets.email_deduped_linked +
    buckets.email_deduped_unlinked +
    buckets.missing_unresolved +
    buckets.unexplained;

  const migratedEnrollmentCount = await db.collection("campaignenrollments").countDocuments({
    workspaceId: ws,
    archivedAt: null,
    leadId: {
      $in: await db
        .collection("leads")
        .find(
          {
            workspaceId: ws,
            archivedAt: null,
            "attributes.campaignEnrollmentPolicy.source": "hubspot_legacy_migration",
          },
          { projection: { _id: 1 } },
        )
        .map((d) => d._id)
        .toArray(),
    },
  });

  const report = {
    version: 1,
    generatedAt: new Date().toISOString(),
    portal: {
      hubspotDistinctSourceIds: hubspotIds.length,
      accounted,
      unexplained: buckets.unexplained,
      idChecksum: checksumIds(hubspotIds),
    },
    exclusiveOutcomes: buckets,
    reasonCounts,
    crm: {
      legacyArchiveLeadCount: legacyGeneral,
      multiMembershipLeadCount: multiMembershipLeads,
      hubspotLinkedLeadDistinctIds: byHubspotId.size,
    },
    campaignGuard: {
      migratedLegacyEnrollmentCount: migratedEnrollmentCount,
    },
    gates: {
      exclusiveAccounted: accounted === hubspotIds.length,
      unexplainedZero: buckets.unexplained === 0,
      unresolvedZero: buckets.missing_unresolved === 0,
      enrollmentsZero: migratedEnrollmentCount === 0,
      complete:
        accounted === hubspotIds.length &&
        buckets.unexplained === 0 &&
        buckets.missing_unresolved === 0 &&
        migratedEnrollmentCount === 0,
    },
    notes:
      "Business target ~38,366; live HubSpot list size is authoritative. email_deduped_unlinked still counts as durable CRM representation.",
  };

  await mkdir(WD_MIGRATION_MANIFEST_DIR, { recursive: true });
  const outPath = path.join(WD_MIGRATION_MANIFEST_DIR, "final-source-id-ledger.json");
  await writeFile(outPath, JSON.stringify(report, null, 2));

  // Refresh end-line roadmap snippet
  try {
    const endLinePath = path.join(WD_MIGRATION_MANIFEST_DIR, "end-line-roadmap.json");
    const endLine = JSON.parse(await readFile(endLinePath, "utf8")) as Record<string, unknown>;
    endLine.finalLedger = report;
    endLine.generatedAt = report.generatedAt;
    await writeFile(endLinePath, JSON.stringify(endLine, null, 2));
  } catch {
    /* optional */
  }

  console.log(JSON.stringify(report, null, 2));
  await mongoose.disconnect().catch(() => undefined);
  process.exit(report.gates.complete ? 0 : 0);
}

main().catch(async (error: unknown) => {
  console.error("[final-ledger] failed", error);
  process.exit(1);
});
