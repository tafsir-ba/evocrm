/**
 * Final HubSpot → EvoHome portal migration executor.
 * Idempotent. Controlled batches. Zero dripping. General only via hard gate.
 *
 * Usage:
 *   npm run migrate:hubspot-final -- --dry-run
 *   npm run migrate:hubspot-final -- --execute --confirm-write
 *   npm run migrate:hubspot-final -- --execute --confirm-write --limit=500
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

function readArg(argv: string[], name: string): string {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg.startsWith(`--${name}=`)) {
      return arg.slice(`--${name}=`.length).trim();
    }
    if (arg === `--${name}`) {
      return argv[index + 1]?.trim() || "";
    }
  }
  return "";
}

function checksumIds(ids: string[]): string {
  const hash = createHash("sha256");
  for (const id of [...ids].sort()) {
    hash.update(id);
    hash.update("\n");
  }
  return hash.digest("hex");
}

type HubSpotContactListPage = {
  results?: Array<{ id: string; properties: Record<string, string | null> }>;
  paging?: { next?: { after?: string } };
};

const EXTRA_PROPERTIES = [
  "createdate",
  "company",
  "jobtitle",
  "industry",
  "state",
  "hs_state_code",
] as const;

async function hubspotListAll(input: {
  accessToken: string;
  properties: string[];
}): Promise<Array<{ id: string; properties: Record<string, string | null> }>> {
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
      if (after) params.set("after", after);
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
    if (!after) break;
  }
  return results;
}

async function main(): Promise<void> {
  bootstrapEnv();
  const argv = process.argv.slice(2);
  const execute = argv.includes("--execute");
  const confirmWrite = argv.includes("--confirm-write");
  const persist = execute && confirmWrite;
  const limitRaw = readArg(argv, "limit");
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 0;
  const checkpointPath = readArg(argv, "checkpoint") ||
    "migrations/hubspot-wd-project/final-migration-checkpoint.json";
  const onlyGaps = !argv.includes("--all");

  if (execute && !confirmWrite) {
    throw new Error("Refusing execute without --confirm-write");
  }

  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) throw new Error("HUBSPOT_ACCESS_TOKEN_required");

  const mongoose = (await import("mongoose")).default;
  await mongoose.connect(process.env.MONGODB_URI!);

  const {
    WD_MIGRATION_HUBSPOT_PROPERTIES,
    WD_MIGRATION_INTEGRATION_ID,
    WD_MIGRATION_MANIFEST_DIR,
    WD_MIGRATION_ROADMAP_FILE,
    WD_MIGRATION_WORKSPACE_ID,
  } = await import("../lib/hubspot-wd-project-migration");
  const { listHubSpotProjectMappings } = await import(
    "../server/repositories/hubspot-project-mappings"
  );
  const { findIntegrationById } = await import("../server/repositories/integrations");
  const { findDictionaryItemByTypeAndKey } = await import(
    "../server/repositories/dictionary-items"
  );
  const { ensureFinalMigrationOutcomeCached } = await import(
    "../server/services/hubspot-final-migration-cached"
  );
  const { snapshotForFinalMigration } = await import(
    "../server/services/hubspot-final-migration"
  );
  const { ensureCmpMembershipForSnapshot } = await import(
    "../server/services/hubspot-cmp-membership"
  );
  const { contactHasCmpProductSignal } = await import("../lib/hubspot-cmp-membership");
  type MappedProject = import("../lib/hubspot-final-migration-policy").MappedProject;
  type FinalMigrationCache = import("../server/services/hubspot-final-migration-cached").FinalMigrationCache;

  const integration = await findIntegrationById(
    WD_MIGRATION_WORKSPACE_ID,
    WD_MIGRATION_INTEGRATION_ID,
  );
  if (!integration) throw new Error("integration_missing");
  const actorId = integration.createdBy;

  const status = await findDictionaryItemByTypeAndKey(
    WD_MIGRATION_WORKSPACE_ID,
    "lead_status",
    "new",
  );
  if (!status?.isActive) throw new Error("lead_status_new_missing");
  const source = await findDictionaryItemByTypeAndKey(
    WD_MIGRATION_WORKSPACE_ID,
    "lead_source",
    "hubspot",
  );

  const roadmap = JSON.parse(
    await readFile(path.join(process.cwd(), WD_MIGRATION_ROADMAP_FILE), "utf8"),
  ) as { fallback_general: string[] };
  const fallbackGeneralSlugs = new Set(roadmap.fallback_general);
  const mappings = await listHubSpotProjectMappings(
    WD_MIGRATION_WORKSPACE_ID,
    WD_MIGRATION_INTEGRATION_ID,
  );
  const mappedBySlug = new Map<string, MappedProject>();
  for (const mapping of mappings) {
    if (mapping.status !== "mapped" || !mapping.evoProjectId) continue;
    mappedBySlug.set(mapping.hubspotProjectId, {
      slug: mapping.hubspotProjectId,
      projectId: mapping.evoProjectId,
      reference: mapping.hubspotProjectId,
    });
  }

  const db = mongoose.connection.db!;
  const ws = new mongoose.Types.ObjectId(WD_MIGRATION_WORKSPACE_ID);

  console.error("[final-migration] preloading CRM indexes…");
  const hubspotToLead = new Map<string, string>();
  const emailIndex = new Map<
    string,
    { leadId: string; nameKey: string; hubspotContactIds: string[] }
  >();
  const leadPrimaryProject = new Map<string, string>();
  const leadMemberships = new Map<string, Set<string>>();

  const leadCursor = db.collection("leads").find(
    { workspaceId: ws, archivedAt: null },
    {
      projection: {
        emailNormalized: 1,
        firstName: 1,
        lastName: 1,
        projectId: 1,
        attributes: 1,
      },
    },
  );
  for await (const doc of leadCursor) {
    const leadId = doc._id.toString();
    const projectId = doc.projectId?.toString?.() ?? String(doc.projectId);
    leadPrimaryProject.set(leadId, projectId);
    const attrs = (doc.attributes ?? {}) as {
      integration?: { externalId?: string; idempotencyKey?: string };
    };
    const hubspotIds: string[] = [];
    if (attrs.integration?.externalId) {
      const id = String(attrs.integration.externalId);
      hubspotIds.push(id);
      if (!hubspotToLead.has(id)) hubspotToLead.set(id, leadId);
    }
    const key = attrs.integration?.idempotencyKey;
    if (typeof key === "string" && key.startsWith("hubspot:contact:")) {
      const id = key.slice("hubspot:contact:".length).split(":")[0];
      if (id) {
        hubspotIds.push(id);
        if (!hubspotToLead.has(id)) hubspotToLead.set(id, leadId);
      }
    }
    const firstName = typeof doc.firstName === "string" ? doc.firstName : "";
    const lastName = typeof doc.lastName === "string" ? doc.lastName : "";
    const nameKey = `${firstName}|${lastName}`.toLowerCase();
    if (typeof doc.emailNormalized === "string" && doc.emailNormalized) {
      const prev = emailIndex.get(doc.emailNormalized);
      if (!prev) {
        emailIndex.set(doc.emailNormalized, {
          leadId,
          nameKey,
          hubspotContactIds: [...new Set(hubspotIds)],
        });
      } else {
        prev.hubspotContactIds = [...new Set([...prev.hubspotContactIds, ...hubspotIds])];
      }
    }
  }

  const memCursor = db.collection("leadprojectmemberships").find(
    { workspaceId: ws, archivedAt: null },
    { projection: { leadId: 1, projectId: 1 } },
  );
  for await (const doc of memCursor) {
    const leadId = doc.leadId?.toString?.() ?? String(doc.leadId);
    const projectId = doc.projectId?.toString?.() ?? String(doc.projectId);
    const set = leadMemberships.get(leadId) ?? new Set<string>();
    set.add(projectId);
    leadMemberships.set(leadId, set);
  }
  console.error(
    `[final-migration] indexes hubspot=${hubspotToLead.size} email=${emailIndex.size} membershipLeads=${leadMemberships.size}`,
  );

  const cache: FinalMigrationCache = {
    actorId,
    statusId: status.id,
    sourceId: source?.isActive ? source.id : undefined,
    mappedBySlug,
    fallbackGeneralSlugs,
    hubspotToLead,
    emailIndex,
    leadMemberships,
    leadPrimaryProject,
  };

  const properties = [
    ...WD_MIGRATION_HUBSPOT_PROPERTIES,
    ...EXTRA_PROPERTIES,
  ];
  console.error("[final-migration] listing HubSpot contacts…");
  let contacts = await hubspotListAll({ accessToken: token, properties });
  console.error(`[final-migration] hubspot contacts: ${contacts.length}`);

  // Checkpoint: skip already-processed contact IDs from prior successful run
  let processedBefore = new Set<string>();
  try {
    const raw = JSON.parse(await readFile(checkpointPath, "utf8")) as {
      processedIds?: string[];
    };
    processedBefore = new Set(raw.processedIds ?? []);
  } catch {
    processedBefore = new Set();
  }

  if (onlyGaps) {
    const represented = new Set(hubspotToLead.keys());
    console.error(`[final-migration] CRM hubspot-linked: ${represented.size}`);
    contacts = contacts.filter((row) => {
      if (processedBefore.has(row.id)) return false;
      if (!represented.has(row.id)) return true;
      const wd = (row.properties.wd_project ?? "")
        .split(/[;,|]/)
        .map((s) => s.trim())
        .filter(Boolean);
      return wd.length > 1;
    });
    console.error(`[final-migration] gap/multi candidates: ${contacts.length}`);
  } else {
    contacts = contacts.filter((row) => !processedBefore.has(row.id));
  }

  contacts.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  if (limit > 0) {
    contacts = contacts.slice(0, limit);
  }

  const totals = {
    scanned: 0,
    created: 0,
    memberships_added: 0,
    preexisting: 0,
    deduped_linked: 0,
    legacy_general: 0,
    error: 0,
    membershipsAddedSum: 0,
    cmpEnsured: 0,
  };
  const reasonCounts: Record<string, number> = {};
  const errorReasons: Record<string, number> = {};
  const processedIds: string[] = [...processedBefore];
  const sampleErrors: string[] = [];

  for (const row of contacts) {
    totals.scanned += 1;
    const snapshot = snapshotForFinalMigration(row.id, row.properties);
    const result = await ensureFinalMigrationOutcomeCached({
      cache,
      snapshot,
      properties: row.properties,
      persist,
    });

    reasonCounts[result.reason] = (reasonCounts[result.reason] ?? 0) + 1;
    if (result.outcome === "created") totals.created += 1;
    else if (result.outcome === "memberships_added") totals.memberships_added += 1;
    else if (result.outcome === "preexisting") totals.preexisting += 1;
    else if (result.outcome === "deduped_linked") totals.deduped_linked += 1;
    else if (result.outcome === "legacy_general") totals.legacy_general += 1;
    else if (result.outcome === "error") {
      totals.error += 1;
      errorReasons[result.reason] = (errorReasons[result.reason] ?? 0) + 1;
      if (sampleErrors.length < 30) sampleErrors.push(row.id);
    }
    totals.membershipsAddedSum += result.membershipsAdded;

    if (persist && contactHasCmpProductSignal(snapshot.productValues)) {
      const cmp = await ensureCmpMembershipForSnapshot({
        snapshot,
        actorId,
        properties: row.properties,
        persist: true,
      });
      if (cmp.outcome === "created") totals.cmpEnsured += 1;
    }

    if (persist && result.outcome !== "error") {
      processedIds.push(row.id);
    }

    if (totals.scanned % 100 === 0) {
      console.error(
        `[final-migration] progress scanned=${totals.scanned} created=${totals.created} legacy=${totals.legacy_general} mem+=${totals.memberships_added} err=${totals.error}`,
      );
      if (persist) {
        await mkdir(path.dirname(checkpointPath), { recursive: true });
        await writeFile(
          checkpointPath,
          JSON.stringify(
            {
              updatedAt: new Date().toISOString(),
              processedIds: [...new Set(processedIds)],
              totals,
            },
            null,
            2,
          ),
        );
      }
    }
  }

  const enrollmentCount = await db.collection("campaignenrollments").countDocuments({
    workspaceId: ws,
    archivedAt: null,
  });
  const hubspotLeadIds = await db
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
    .toArray();
  const migratedEnrollmentCount = await db.collection("campaignenrollments").countDocuments({
    workspaceId: ws,
    leadId: { $in: hubspotLeadIds },
    archivedAt: null,
  });

  const report = {
    version: 1,
    generatedAt: new Date().toISOString(),
    mode: persist ? "execute" : "dry-run",
    policy: "hubspot_final_migration_v1",
    onlyGaps,
    limit: limit || null,
    totals,
    reasonCounts,
    errorReasons,
    sampleErrorIds: sampleErrors,
    campaignGuard: {
      workspaceEnrollmentCount: enrollmentCount,
      migratedLegacyEnrollmentCount: migratedEnrollmentCount,
      hubspotLegacyLeadCount: hubspotLeadIds.length,
    },
    idChecksums: {
      processedThisRun: checksumIds(contacts.map((c) => c.id)),
    },
    gates: {
      enrollmentsZero: migratedEnrollmentCount === 0,
      errorsAcceptable: totals.error === 0,
    },
  };

  const outDir = WD_MIGRATION_MANIFEST_DIR;
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "final-migration-report.json");
  await writeFile(outPath, JSON.stringify(report, null, 2));
  if (persist) {
    await writeFile(
      checkpointPath,
      JSON.stringify(
        {
          updatedAt: new Date().toISOString(),
          processedIds: [...new Set(processedIds)],
          totals,
        },
        null,
        2,
      ),
    );
  }

  console.log(JSON.stringify(report, null, 2));
  await mongoose.disconnect().catch(() => undefined);
  if (persist && totals.error > 0 && totals.created + totals.legacy_general === 0) {
    process.exit(2);
  }
}

main().catch(async (error: unknown) => {
  console.error("[final-migration] failed", error);
  try {
    const mongoose = (await import("mongoose")).default;
    await mongoose.disconnect().catch(() => undefined);
  } catch {
    /* ignore */
  }
  process.exit(1);
});
