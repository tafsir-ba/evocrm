/**
 * Measure email-bearing nameless HubSpot contacts for reclassification.
 * Exclusive buckets — no overlap with migrated / multi / email-dedupe cohorts.
 * No PII in output (HubSpot contact IDs only).
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
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function hubspotListAll(input: {
  accessToken: string;
  properties: string[];
}): Promise<Array<{ id: string; properties: Record<string, string | null> }>> {
  const results: Array<{ id: string; properties: Record<string, string | null> }> = [];
  let after: string | undefined;
  type HubSpotListPage = {
    results?: Array<{ id: string; properties: Record<string, string | null | undefined> }>;
    paging?: { next?: { after?: string } };
  };
  for (;;) {
    let page: HubSpotListPage | null = null;
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
        throw new Error(`hubspot_list_${response.status}`);
      }
      page = (await response.json()) as HubSpotListPage;
      break;
    }
    if (!page) {
      throw new Error("hubspot_list_failed");
    }
    for (const result of page.results ?? []) {
      results.push({
        id: String(result.id),
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
    await sleep(200);
  }
  return results;
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
  const {
    snapshotFromHubSpotProperties,
    hubspotContactIdsFromLeadAttributes,
    normalizePilotEmail,
    pilotNameKey,
    isEmailBearingNameless,
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
  const migratableSlugs = new Set([...roadmap.create_then_map, ...roadmap.map_existing, "CMP"]);
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
      { projection: { emailNormalized: 1, email: 1, firstName: 1, lastName: 1, attributes: 1 } },
    )
    .toArray();

  type Existing = {
    emailNormalized: string | null;
    nameKey: string;
    hubspotContactIds: string[];
  };
  const allExisting: Existing[] = [];
  for (const doc of leadDocs) {
    const emailNormalized =
      typeof doc.emailNormalized === "string"
        ? doc.emailNormalized
        : normalizePilotEmail(String(doc.email ?? ""));
    const nameKey = pilotNameKey(String(doc.firstName ?? ""), String(doc.lastName ?? ""));
    const hubspotContactIds = hubspotContactIdsFromLeadAttributes(
      doc.attributes as Record<string, unknown> | undefined,
    );
    allExisting.push({ emailNormalized, nameKey, hubspotContactIds });
  }

  const contacts = await hubspotListAll({
    accessToken: token,
    properties: [...WD_MIGRATION_HUBSPOT_PROPERTIES],
  });

  const buckets = {
    nameless_email_still_to_migrate: [] as string[],
    nameless_email_preexisting_deduped: [] as string[],
    nameless_email_migrated: [] as string[],
    nameless_email_multi_or_conflict: [] as string[],
    nameless_email_excluded_other: [] as string[],
    nameless_email_no_project_signal: [] as string[],
    nameless_no_email: [] as string[],
    not_nameless: 0,
  };

  for (const contact of contacts) {
    const snapshot = snapshotFromHubSpotProperties(contact.id, contact.properties);
    if (!isEmailBearingNameless(snapshot)) {
      if (
        !snapshot.emailNormalized &&
        (!snapshot.firstName.trim() || !snapshot.lastName.trim())
      ) {
        buckets.nameless_no_email.push(contact.id);
      } else {
        buckets.not_nameless += 1;
      }
      continue;
    }

    const classification = classifyPortalContact({
      snapshot,
      existing: allExisting,
      fallbackGeneralSlugs,
      migratableSlugs,
    });

    switch (classification.bucket) {
      case "still_to_migrate":
        buckets.nameless_email_still_to_migrate.push(contact.id);
        break;
      case "preexisting_deduped":
        buckets.nameless_email_preexisting_deduped.push(contact.id);
        break;
      case "migrated":
        buckets.nameless_email_migrated.push(contact.id);
        break;
      case "multi_or_identity_exception":
        buckets.nameless_email_multi_or_conflict.push(contact.id);
        break;
      case "no_project_signal":
        buckets.nameless_email_no_project_signal.push(contact.id);
        break;
      default:
        buckets.nameless_email_excluded_other.push(contact.id);
        break;
    }
  }

  const sortIds = (ids: string[]) => [...ids].sort((a, b) => Number(a) - Number(b));
  for (const key of Object.keys(buckets) as Array<keyof typeof buckets>) {
    if (Array.isArray(buckets[key])) {
      buckets[key] = sortIds(buckets[key] as string[]) as never;
    }
  }

  const report = {
    version: 1,
    generatedAt: new Date().toISOString(),
    workspaceId: WD_MIGRATION_WORKSPACE_ID,
    scanned: contacts.length,
    rule: "email_bearing_nameless_reclassification",
    bucketCounts: {
      nameless_email_still_to_migrate: buckets.nameless_email_still_to_migrate.length,
      nameless_email_preexisting_deduped: buckets.nameless_email_preexisting_deduped.length,
      nameless_email_migrated: buckets.nameless_email_migrated.length,
      nameless_email_multi_or_conflict: buckets.nameless_email_multi_or_conflict.length,
      nameless_email_excluded_other: buckets.nameless_email_excluded_other.length,
      nameless_email_no_project_signal: buckets.nameless_email_no_project_signal.length,
      nameless_no_email: buckets.nameless_no_email.length,
      not_nameless: buckets.not_nameless,
    },
    idChecksum: checksumContactIds(
      sortIds([
        ...buckets.nameless_email_still_to_migrate,
        ...buckets.nameless_email_preexisting_deduped,
        ...buckets.nameless_email_migrated,
        ...buckets.nameless_email_multi_or_conflict,
        ...buckets.nameless_email_excluded_other,
        ...buckets.nameless_email_no_project_signal,
        ...buckets.nameless_no_email,
      ]),
    ),
    buckets,
    notes:
      "Exclusive nameless/email buckets. still_to_migrate is the reclassified write cohort. Never routes ambiguity to General.",
  };

  const outDir = path.join(process.cwd(), WD_MIGRATION_MANIFEST_DIR);
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "nameless-email-cohort.json");
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(
    JSON.stringify(
      {
        ok: true,
        outPath,
        bucketCounts: report.bucketCounts,
        stillToMigrate: report.bucketCounts.nameless_email_still_to_migrate,
      },
      null,
      2,
    ),
  );

  await mongoose.default.disconnect().catch(() => undefined);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown_error";
  console.error(JSON.stringify({ ok: false, error: message }));
  process.exit(1);
});
