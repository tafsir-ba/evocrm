/**
 * Before/after reconciliation for email-bearing missing_name policy change.
 * HubSpot contact IDs only — no PII. Computes CMP + multi-project overlaps.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
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

async function loadManifestIds(dir: string, pattern: RegExp): Promise<Set<string>> {
  const { readdir } = await import("node:fs/promises");
  const ids = new Set<string>();
  for (const entry of await readdir(dir)) {
    if (!pattern.test(entry)) {
      continue;
    }
    const raw = JSON.parse(await readFile(path.join(dir, entry), "utf8")) as {
      hubspotContactIds?: string[];
    };
    for (const id of raw.hubspotContactIds ?? []) {
      ids.add(String(id));
    }
  }
  return ids;
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
    hasCompletePilotName,
    checksumContactIds,
  } = await import("../lib/hubspot-gv-pilot");
  const mongoose = await import("mongoose");
  const { connectDb } = await import("../server/db/mongoose");

  const manifestDir = path.join(process.cwd(), WD_MIGRATION_MANIFEST_DIR);
  const cmpIds = await loadManifestIds(manifestDir, /^cmp-batch-/);

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
  const existingLeads = leadDocs.map((doc) => {
    const emailNormalized =
      typeof doc.emailNormalized === "string"
        ? doc.emailNormalized
        : normalizePilotEmail(String(doc.email ?? ""));
    const nameKey = pilotNameKey(String(doc.firstName ?? ""), String(doc.lastName ?? ""));
    const hubspotContactIds = hubspotContactIdsFromLeadAttributes(
      doc.attributes as Record<string, unknown> | undefined,
    );
    return { emailNormalized, nameKey, hubspotContactIds };
  });

  const contacts = await hubspotListAll({
    accessToken: token,
    properties: [...WD_MIGRATION_HUBSPOT_PROPERTIES],
  });

  const before = {
    excluded_missing_name_with_email: [] as string[],
  };
  const after = {
    eligible_with_project: [] as string[],
    held_no_project_signal: [] as string[],
    multi_or_conflict: [] as string[],
    other_excluded: [] as string[],
    already_migrated: [] as string[],
    preexisting_deduped: [] as string[],
  };
  const overlaps = {
    eligible_vs_cmp_cohort: [] as string[],
    eligible_vs_multi_queue: [] as string[],
    held_vs_cmp_cohort: [] as string[],
  };

  for (const contact of contacts) {
    const snapshot = snapshotFromHubSpotProperties(contact.id, contact.properties);
    if (!isEmailBearingNameless(snapshot)) {
      continue;
    }

    const legacyMissingName = !hasCompletePilotName(snapshot.firstName, snapshot.lastName);
    if (legacyMissingName && snapshot.emailNormalized) {
      before.excluded_missing_name_with_email.push(contact.id);
    }

    const classification = classifyPortalContact({
      snapshot,
      existing: existingLeads,
      fallbackGeneralSlugs,
      migratableSlugs,
    });

    switch (classification.bucket) {
      case "migrated":
        after.already_migrated.push(contact.id);
        break;
      case "preexisting_deduped":
        after.preexisting_deduped.push(contact.id);
        break;
      case "still_to_migrate": {
        after.eligible_with_project.push(contact.id);
        if (cmpIds.has(contact.id)) {
          overlaps.eligible_vs_cmp_cohort.push(contact.id);
        }
        break;
      }
      case "multi_or_identity_exception":
        after.multi_or_conflict.push(contact.id);
        if (classification.reason === "multi_project") {
          overlaps.eligible_vs_multi_queue.push(contact.id);
        }
        break;
      case "no_project_signal":
        after.held_no_project_signal.push(contact.id);
        if (cmpIds.has(contact.id)) {
          overlaps.held_vs_cmp_cohort.push(contact.id);
        }
        break;
      default:
        after.other_excluded.push(contact.id);
        break;
    }
  }

  const sortIds = (ids: string[]) => [...ids].sort((a, b) => Number(a) - Number(b));
  for (const bucket of Object.values(before)) {
    bucket.sort((a, b) => Number(a) - Number(b));
  }
  for (const bucket of Object.values(after)) {
    bucket.sort((a, b) => Number(a) - Number(b));
  }
  for (const bucket of Object.values(overlaps)) {
    bucket.sort((a, b) => Number(a) - Number(b));
  }

  const report = {
    version: 2,
    generatedAt: new Date().toISOString(),
    workspaceId: WD_MIGRATION_WORKSPACE_ID,
    policy: "email_bearing_missing_name_reclassification_v2",
    scanned: contacts.length,
    before: {
      counts: {
        excluded_missing_name_with_email: before.excluded_missing_name_with_email.length,
      },
      idChecksum: checksumContactIds(before.excluded_missing_name_with_email),
    },
    after: {
      counts: {
        eligible_with_project: after.eligible_with_project.length,
        held_no_project_signal: after.held_no_project_signal.length,
        multi_or_conflict: after.multi_or_conflict.length,
        other_excluded: after.other_excluded.length,
        already_migrated: after.already_migrated.length,
        preexisting_deduped: after.preexisting_deduped.length,
      },
      idChecksum: checksumContactIds(
        sortIds([
          ...after.eligible_with_project,
          ...after.held_no_project_signal,
          ...after.multi_or_conflict,
          ...after.other_excluded,
          ...after.already_migrated,
          ...after.preexisting_deduped,
        ]),
      ),
    },
    overlaps: {
      cmpCohortSize: cmpIds.size,
      counts: {
        eligible_vs_cmp_cohort: overlaps.eligible_vs_cmp_cohort.length,
        eligible_vs_multi_queue: overlaps.eligible_vs_multi_queue.length,
        held_vs_cmp_cohort: overlaps.held_vs_cmp_cohort.length,
      },
      notes:
        "eligible_vs_cmp_cohort must be 0 to avoid double-counting with CMP wave. multi queue overlap is expected for multi_project contacts held out of migration.",
    },
    buckets: { before, after, overlaps },
    delta: {
      reclassified_from_missing_name_only:
        after.eligible_with_project.length +
        after.held_no_project_signal.length -
        0 /* held were also missing_name under old policy */,
      net_new_write_eligible: after.eligible_with_project.length,
    },
    notes:
      "Before: legacy missing_name exclusion applied even with valid email. After: email-bearing contacts eligible when project-attributed; no-project held under no_project_signal; never excluded solely for missing name.",
  };

  await mkdir(manifestDir, { recursive: true });
  const outPath = path.join(manifestDir, "email-name-policy-reconciliation.json");
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(
    JSON.stringify(
      {
        ok: true,
        outPath,
        beforeExcluded: report.before.counts.excluded_missing_name_with_email,
        afterEligible: report.after.counts.eligible_with_project,
        afterHeld: report.after.counts.held_no_project_signal,
        overlaps: report.overlaps.counts,
        gatesPassed: report.overlaps.counts.eligible_vs_cmp_cohort === 0,
      },
      null,
      2,
    ),
  );

  await mongoose.default.disconnect().catch(() => undefined);
  if (report.overlaps.counts.eligible_vs_cmp_cohort !== 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown_error";
  console.error(JSON.stringify({ ok: false, error: message }));
  process.exit(1);
});
