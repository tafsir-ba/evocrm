/**
 * Ensure CMP membership for every product_intersted_in=CMP HubSpot contact.
 * Bulk-preloads CRM indexes for speed. Idempotent. Zero dripping.
 */
import { mkdir, writeFile } from "node:fs/promises";
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

async function hubspotSearchAllEq(input: {
  accessToken: string;
  properties: string[];
}): Promise<Array<{ id: string; properties: Record<string, string | null> }>> {
  const byId = new Map<string, { id: string; properties: Record<string, string | null> }>();
  let after: string | undefined;
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
                { propertyName: "product_intersted_in", operator: "EQ", value: "CMP" },
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
    if (!page) throw new Error("hubspot_cmp_search_failed");
    for (const result of page.results ?? []) {
      const id = String(result.id ?? "");
      if (!id || byId.has(id)) continue;
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
    if (byId.size % 1000 === 0) {
      console.error(JSON.stringify({ progress: "hubspot_search", scanned: byId.size, total: page.total }));
    }
    after = page.paging?.next?.after;
    if (!after) break;
    await sleep(200);
  }
  return [...byId.values()];
}

async function main(): Promise<void> {
  bootstrapEnv();
  const argv = process.argv.slice(2);
  const persist = argv.includes("--execute") && argv.includes("--confirm-write");
  const limitRaw = readArg(argv, "limit");
  const limit = limitRaw ? Number(limitRaw) : 0;
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) throw new Error("HUBSPOT_ACCESS_TOKEN_required");

  const {
    WD_MIGRATION_HUBSPOT_PROPERTIES,
    WD_MIGRATION_INTEGRATION_ID,
    WD_MIGRATION_MANIFEST_DIR,
    WD_MIGRATION_WORKSPACE_ID,
  } = await import("../lib/hubspot-wd-project-migration");
  const {
    checksumContactIds,
    normalizePilotEmail,
    snapshotFromHubSpotProperties,
    hubspotContactIdempotencyKey,
  } = await import("../lib/hubspot-gv-pilot");
  const { hubspotCmpProjectIdempotencyKey } = await import("../lib/hubspot-cmp-membership");
  const { ensureCmpMembershipForSnapshot, CMP_PROJECT_ID } = await import(
    "../server/services/hubspot-cmp-membership"
  );
  const { findIntegrationById } = await import("../server/repositories/integrations");
  const { connectDb } = await import("../server/db/mongoose");
  const mongoose = await import("mongoose");

  await connectDb();
  const integration = await findIntegrationById(
    WD_MIGRATION_WORKSPACE_ID,
    WD_MIGRATION_INTEGRATION_ID,
  );
  if (!integration) throw new Error("integration_missing");
  const actorId = integration.createdBy;
  const db = mongoose.default.connection.db!;
  const wsOid = new mongoose.default.Types.ObjectId(WD_MIGRATION_WORKSPACE_ID);
  const cmpOid = new mongoose.default.Types.ObjectId(CMP_PROJECT_ID);

  console.error(JSON.stringify({ event: "preload_crm_indexes" }));
  const cmpLeads = await db
    .collection("leads")
    .find(
      { workspaceId: wsOid, projectId: cmpOid, archivedAt: null },
      { projection: { emailNormalized: 1, attributes: 1 } },
    )
    .toArray();
  const cmpExternalIds = new Set<string>();
  const cmpEmails = new Set<string>();
  const cmpKeys = new Set<string>();
  for (const lead of cmpLeads) {
    const attrs = lead.attributes as {
      integration?: { externalId?: string; idempotencyKey?: string };
    };
    if (attrs?.integration?.externalId) cmpExternalIds.add(String(attrs.integration.externalId));
    if (attrs?.integration?.idempotencyKey) cmpKeys.add(String(attrs.integration.idempotencyKey));
    if (typeof lead.emailNormalized === "string" && lead.emailNormalized) {
      cmpEmails.add(lead.emailNormalized);
    }
  }

  const elsewhereLeads = await db
    .collection("leads")
    .find(
      {
        workspaceId: wsOid,
        archivedAt: null,
        projectId: { $ne: cmpOid },
        "attributes.integration.externalId": { $exists: true },
      },
      { projection: { "attributes.integration.externalId": 1, "attributes.integration.idempotencyKey": 1 } },
    )
    .toArray();
  const elsewhereIds = new Set<string>();
  const classicKeysElsewhere = new Set<string>();
  for (const lead of elsewhereLeads) {
    const attrs = lead.attributes as {
      integration?: { externalId?: string; idempotencyKey?: string };
    };
    if (attrs?.integration?.externalId) elsewhereIds.add(String(attrs.integration.externalId));
    if (attrs?.integration?.idempotencyKey) {
      classicKeysElsewhere.add(String(attrs.integration.idempotencyKey));
    }
  }

  const properties = [...WD_MIGRATION_HUBSPOT_PROPERTIES, "createdate"];
  let contacts = await hubspotSearchAllEq({ accessToken: token, properties });
  contacts.sort((a, b) => Number(a.id) - Number(b.id));
  if (limit > 0) contacts = contacts.slice(0, limit);
  console.error(JSON.stringify({ event: "cohort_loaded", size: contacts.length, cmpLeads: cmpLeads.length }));

  const totals = {
    scanned: contacts.length,
    created: 0,
    preexisting: 0,
    parked: 0,
    error: 0,
    createdPrimary: 0,
    createdAdditional: 0,
  };
  const parkedReasons: Record<string, number> = {};
  const errorReasons: Record<string, number> = {};
  const createdIds: string[] = [];
  const preexistingIds: string[] = [];
  const parkedIds: string[] = [];
  const errorIds: string[] = [];

  let index = 0;
  for (const contact of contacts) {
    index += 1;
    const snapshot = snapshotFromHubSpotProperties(contact.id, contact.properties);
    const classicKey = hubspotContactIdempotencyKey(contact.id);
    const projectKey = hubspotCmpProjectIdempotencyKey(contact.id);
    const email = snapshot.emailNormalized;

    const alreadyOnCmp =
      cmpExternalIds.has(contact.id) ||
      cmpKeys.has(classicKey) ||
      cmpKeys.has(projectKey) ||
      (email ? cmpEmails.has(email) : false);

    if (alreadyOnCmp) {
      totals.preexisting += 1;
      preexistingIds.push(contact.id);
      if (index % 500 === 0) {
        console.error(JSON.stringify({ progress: "ensure", index, totals }));
      }
      continue;
    }

    if (!snapshot.emailNormalized && !snapshot.hasPhone) {
      totals.parked += 1;
      parkedIds.push(contact.id);
      parkedReasons.missing_email_and_phone = (parkedReasons.missing_email_and_phone ?? 0) + 1;
      continue;
    }

    if (!persist) {
      totals.created += 1;
      createdIds.push(contact.id);
      continue;
    }

    const result = await ensureCmpMembershipForSnapshot({
      snapshot,
      actorId,
      properties: contact.properties,
      persist: true,
    });

    if (result.outcome === "created") {
      totals.created += 1;
      createdIds.push(contact.id);
      if (result.role === "primary") totals.createdPrimary += 1;
      if (result.role === "additional") totals.createdAdditional += 1;
      cmpExternalIds.add(contact.id);
      if (email) cmpEmails.add(email);
      if (result.idempotencyKey) cmpKeys.add(result.idempotencyKey);
    } else if (result.outcome === "preexisting") {
      totals.preexisting += 1;
      preexistingIds.push(contact.id);
      cmpExternalIds.add(contact.id);
      if (email) cmpEmails.add(email);
    } else if (result.outcome === "parked") {
      totals.parked += 1;
      parkedIds.push(contact.id);
      parkedReasons[result.reason] = (parkedReasons[result.reason] ?? 0) + 1;
    } else {
      totals.error += 1;
      errorIds.push(contact.id);
      errorReasons[result.reason] = (errorReasons[result.reason] ?? 0) + 1;
      console.error(JSON.stringify({ event: "error", contactId: contact.id, reason: result.reason }));
    }

    if (index % 50 === 0) {
      console.error(JSON.stringify({ progress: "ensure", index, totals }));
    }
  }

  const cmpLeadCount = await db.collection("leads").countDocuments({
    workspaceId: wsOid,
    projectId: cmpOid,
  });
  const enroll = await db.collection("campaignenrollments").countDocuments({
    workspaceId: wsOid,
    projectId: cmpOid,
  });
  const guarded = await db.collection("leads").countDocuments({
    workspaceId: wsOid,
    projectId: cmpOid,
    "attributes.campaignEnrollmentPolicy.defaultExcluded": true,
  });

  const report = {
    version: 1,
    generatedAt: new Date().toISOString(),
    mode: persist ? "execute" : "dry-run",
    destinationProjectId: CMP_PROJECT_ID,
    policy: "product_intersted_in_cmp_requires_cmp_membership",
    totals,
    parkedReasons,
    errorReasons,
    campaignGuard: {
      cmpLeadCount,
      guarded,
      enrollmentCount: enroll,
    },
    idChecksums: {
      created: checksumContactIds(createdIds),
      preexisting: checksumContactIds(preexistingIds),
      parked: checksumContactIds(parkedIds),
      error: checksumContactIds(errorIds),
    },
    sampleErrorIds: errorIds.slice(0, 20),
    sampleParkedIds: parkedIds.slice(0, 20),
    gates: {
      enrollmentsZero: enroll === 0,
      allGuarded: guarded === cmpLeadCount,
      errorsZero: totals.error === 0,
    },
  };

  const outDir = path.join(process.cwd(), WD_MIGRATION_MANIFEST_DIR);
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "cmp-membership-ensure-report.json");
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, outPath, report }, null, 2));

  await mongoose.default.disconnect().catch(() => undefined);
  if (persist && (totals.error > 0 || enroll > 0)) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "unknown" }));
  process.exit(1);
});
