/**
 * Select write-eligible email-bearing nameless contacts from the measured cohort.
 * Groups by attributable project slug; writes PII-free manifests per destination.
 * Never routes ambiguity to General; excludes IDs already present in other manifests.
 */
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
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

async function loadExistingManifestIds(manifestDir: string): Promise<Set<string>> {
  const ids = new Set<string>();
  let entries: string[] = [];
  try {
    entries = await readdir(manifestDir);
  } catch {
    return ids;
  }
  for (const entry of entries) {
    if (!entry.endsWith(".json") || entry.includes("cohort") || entry.includes("recon")) {
      continue;
    }
    try {
      const raw = JSON.parse(await readFile(path.join(manifestDir, entry), "utf8")) as {
        hubspotContactIds?: string[];
      };
      for (const id of raw.hubspotContactIds ?? []) {
        ids.add(String(id));
      }
    } catch {
      // skip malformed manifests
    }
  }
  return ids;
}

async function main(): Promise<void> {
  bootstrapEnv();
  const argv = process.argv.slice(2);
  const slugFilter = readArg(argv, "slug").toLowerCase();
  const cohortFile =
    readArg(argv, "cohort") ||
    path.join(process.cwd(), "migrations/hubspot-wd-project/nameless-email-cohort.json");

  const token = (process.env.HUBSPOT_ACCESS_TOKEN ?? "").trim();
  if (!token || token.includes("*")) {
    throw new Error("hubspot_access_token_unavailable");
  }

  const {
    WD_MIGRATION_FORBIDDEN_SLUG,
    WD_MIGRATION_GENERAL_PROJECT_ID,
    WD_MIGRATION_HUBSPOT_PROPERTIES,
    WD_MIGRATION_INTEGRATION_ID,
    WD_MIGRATION_MANIFEST_DIR,
    WD_MIGRATION_MAX_BATCH,
    WD_MIGRATION_PORTAL_ID,
    WD_MIGRATION_ROADMAP_FILE,
    WD_MIGRATION_WORKSPACE_ID,
    assertExplicitMappedDestination,
    classifyPortalContact,
    evaluateWdProjectEligibility,
    selectSortedContactIds,
  } = await import("../lib/hubspot-wd-project-migration");
  const {
    assertManifestHasNoPii,
    checksumContactIds,
    hubspotContactIdsFromLeadAttributes,
    isEmailBearingNameless,
    normalizePilotEmail,
    pilotNameKey,
    snapshotFromHubSpotProperties,
  } = await import("../lib/hubspot-gv-pilot");
  const { fetchHubSpotContactsByIds } = await import("../server/services/hubspot-client");
  const { listHubSpotProjectMappings } = await import(
    "../server/repositories/hubspot-project-mappings"
  );
  const { findProjectById } = await import("../server/repositories/projects");
  const { connectDb } = await import("../server/db/mongoose");
  const mongoose = await import("mongoose");

  const cohortRaw = JSON.parse(await readFile(cohortFile, "utf8")) as {
    buckets?: { nameless_email_still_to_migrate?: string[] };
  };
  const cohortIds = cohortRaw.buckets?.nameless_email_still_to_migrate ?? [];
  if (cohortIds.length === 0) {
    throw new Error("nameless_cohort_empty");
  }

  const manifestDir = path.join(process.cwd(), WD_MIGRATION_MANIFEST_DIR);
  const alreadyManifested = await loadExistingManifestIds(manifestDir);
  const candidateIds = cohortIds.filter((id) => !alreadyManifested.has(id));

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

  const mappings = await listHubSpotProjectMappings(
    WD_MIGRATION_WORKSPACE_ID,
    WD_MIGRATION_INTEGRATION_ID,
  );
  const mappingBySlug = new Map(
    mappings
      .filter((row) => row.status === "mapped" && row.evoProjectId)
      .map((row) => [row.hubspotProjectId, row]),
  );

  const contacts = await fetchHubSpotContactsByIds({
    accessToken: token,
    contactIds: candidateIds,
    properties: [...WD_MIGRATION_HUBSPOT_PROPERTIES],
  });
  const snapshots = contacts.map((contact) =>
    snapshotFromHubSpotProperties(String(contact.id), contact.properties),
  );

  const bySlug = new Map<string, string[]>();
  const skipCounts = {
    not_nameless: 0,
    not_still_to_migrate: 0,
    no_attributable_slug: 0,
    slug_filtered: 0,
    no_mapping: 0,
    not_write_eligible: 0,
    forbidden_slug: 0,
    general_destination: 0,
  };

  for (const snapshot of snapshots) {
    if (!isEmailBearingNameless(snapshot)) {
      skipCounts.not_nameless += 1;
      continue;
    }
    const classification = classifyPortalContact({
      snapshot,
      existing: existingLeads,
      fallbackGeneralSlugs,
      migratableSlugs,
    });
    if (classification.bucket !== "still_to_migrate") {
      skipCounts.not_still_to_migrate += 1;
      continue;
    }
    const slug = classification.attributableSlug;
    if (!slug) {
      skipCounts.no_attributable_slug += 1;
      continue;
    }
    if (slug === WD_MIGRATION_FORBIDDEN_SLUG) {
      skipCounts.forbidden_slug += 1;
      continue;
    }
    if (slugFilter && slug.toLowerCase() !== slugFilter) {
      skipCounts.slug_filtered += 1;
      continue;
    }
    const mapping = mappingBySlug.get(slug);
    if (!mapping?.evoProjectId) {
      skipCounts.no_mapping += 1;
      continue;
    }
    if (mapping.evoProjectId === WD_MIGRATION_GENERAL_PROJECT_ID) {
      skipCounts.general_destination += 1;
      continue;
    }
    const eligibility = evaluateWdProjectEligibility(snapshot, existingLeads, slug);
    if (!eligibility.writeEligible) {
      skipCounts.not_write_eligible += 1;
      continue;
    }
    const list = bySlug.get(slug) ?? [];
    list.push(snapshot.hubspotContactId);
    bySlug.set(slug, list);
  }

  await mkdir(manifestDir, { recursive: true });
  const manifestSummaries: Array<{
    slug: string;
    name: string;
    size: number;
    destinationProjectId: string;
    destinationReference: string;
    idChecksum: string;
  }> = [];

  for (const [slug, rawIds] of [...bySlug.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const mapping = mappingBySlug.get(slug)!;
    const project = await findProjectById(WD_MIGRATION_WORKSPACE_ID, mapping.evoProjectId!);
    if (!project || project.archivedAt) {
      skipCounts.no_mapping += rawIds.length;
      continue;
    }
    assertExplicitMappedDestination({
      slug,
      destinationProjectId: project.id,
      destinationReference: project.reference ?? "",
      mapping: {
        hubspotProjectId: mapping.hubspotProjectId,
        status: mapping.status,
        evoProjectId: mapping.evoProjectId,
      },
    });

    const selected = selectSortedContactIds(rawIds);
    const batchCount = Math.ceil(selected.length / WD_MIGRATION_MAX_BATCH);
    for (let batchIndex = 0; batchIndex < batchCount; batchIndex += 1) {
      const start = batchIndex * WD_MIGRATION_MAX_BATCH;
      const batchIds = selected.slice(start, start + WD_MIGRATION_MAX_BATCH);
      const batchName =
        batchCount === 1
          ? `nameless-${slug.toLowerCase()}-batch-01`
          : `nameless-${slug.toLowerCase()}-batch-${String(batchIndex + 1).padStart(2, "0")}`;
      const manifest = {
        name: batchName,
        version: 1 as const,
        portalId: WD_MIGRATION_PORTAL_ID,
        workspaceId: WD_MIGRATION_WORKSPACE_ID,
        destinationProjectId: project.id,
        destinationReference: project.reference ?? "",
        slug,
        sourceHubSpotProjectId: slug,
        size: batchIds.length,
        selection: {
          pool: "nameless_email_reclassification" as const,
          sort: "hubspot_contact_id_asc" as const,
          exclude: [
            "email_match",
            "hubspot_id_match",
            "identity_conflict",
            "multi_project",
            "broker_only",
            "missing_name",
            "notes_conflict",
            "notes_only",
            "no_project_signal",
            "product_vs_wd_conflict",
            "missing_email_and_phone",
          ],
        },
        hubspotContactIds: batchIds,
        idChecksum: checksumContactIds(batchIds),
      };
      assertManifestHasNoPii(manifest);
      await writeFile(
        path.join(manifestDir, `${batchName}.json`),
        `${JSON.stringify(manifest, null, 2)}\n`,
      );
      manifestSummaries.push({
        slug,
        name: batchName,
        size: batchIds.length,
        destinationProjectId: project.id,
        destinationReference: project.reference ?? "",
        idChecksum: manifest.idChecksum,
      });
    }
  }

  const totalSelected = manifestSummaries.reduce((sum, row) => sum + row.size, 0);
  console.log(
    JSON.stringify(
      {
        ok: true,
        cohortFile,
        cohortStillToMigrate: cohortIds.length,
        alreadyManifested: alreadyManifested.size,
        candidates: candidateIds.length,
        fetched: snapshots.length,
        skipCounts,
        slugCount: bySlug.size,
        totalSelected,
        manifests: manifestSummaries,
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
