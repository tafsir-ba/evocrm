/**
 * Live-select NEW write-eligible HubSpot contacts for one wd_project slug.
 * Writes a PII-free manifest. Never prints emails or names.
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
  // NODE_ENV is runtime-owned (read-only in production typing); never assign it.
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function hubspotSearchPage(input: {
  accessToken: string;
  propertyName: string;
  slug: string;
  properties: string[];
  after?: string;
}): Promise<{
  total: number;
  results: Array<{ id: string; properties: Record<string, string | null> }>;
  after?: string;
}> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
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
                operator: "CONTAINS_TOKEN",
                value: input.slug,
              },
            ],
          },
        ],
        properties: input.properties,
        limit: 100,
        after: input.after,
      }),
    });
    if (response.status === 429) {
      await sleep(500 * 2 ** attempt);
      continue;
    }
    if (!response.ok) {
      lastError = new Error(`hubspot_search_failed:${response.status}`);
      await sleep(500 * 2 ** attempt);
      continue;
    }
    const body = (await response.json()) as {
      total?: number;
      results?: Array<{ id?: string; properties?: Record<string, string | null | undefined> }>;
      paging?: { next?: { after?: string } };
    };
    return {
      total: body.total ?? 0,
      results: (body.results ?? []).map((result) => ({
        id: String(result.id ?? ""),
        properties: Object.fromEntries(
          Object.entries(result.properties ?? {}).map(([key, value]) => [
            key,
            typeof value === "string" ? value : null,
          ]),
        ),
      })),
      after: body.paging?.next?.after,
    };
  }
  throw lastError instanceof Error ? lastError : new Error("hubspot_search_failed");
}

async function main(): Promise<void> {
  bootstrapEnv();
  const argv = process.argv.slice(2);
  const slug = readArg(argv, "slug");
  const destinationProjectId = readArg(argv, "destination");
  const destinationReference = readArg(argv, "reference");
  const manifestName = readArg(argv, "manifest") || `${slug}-batch-01`;
  if (!slug || !destinationProjectId || !destinationReference) {
    throw new Error("usage: --slug --destination --reference [--manifest]");
  }

  const {
    WD_MIGRATION_EXCEPTION_DIR,
    WD_MIGRATION_FORBIDDEN_SLUG,
    WD_MIGRATION_HUBSPOT_PROPERTIES,
    WD_MIGRATION_MANIFEST_DIR,
    WD_MIGRATION_PORTAL_ID,
    WD_MIGRATION_WORKSPACE_ID,
    assertExplicitMappedDestination,
    buildExceptionBuckets,
    evaluateWdProjectEligibility,
    selectSortedContactIds,
  } = await import("../lib/hubspot-wd-project-migration");
  const { assertManifestHasNoPii } = await import("../lib/hubspot-gv-pilot");
  const { checksumContactIds, snapshotFromHubSpotProperties, existingLeadFromRecord } =
    await import("../lib/hubspot-gv-pilot");
  const { listHubSpotProjectMappings } = await import(
    "../server/repositories/hubspot-project-mappings"
  );
  const { findLeadsForHubSpotGvPilotDedupe } = await import("../server/repositories/leads");
  const { findProjectById } = await import("../server/repositories/projects");
  const { WD_MIGRATION_INTEGRATION_ID } = await import("../lib/hubspot-wd-project-migration");

  if (slug === WD_MIGRATION_FORBIDDEN_SLUG) {
    throw new Error("select_refused:grosvenor_slug");
  }

  const token = (process.env.HUBSPOT_ACCESS_TOKEN ?? "").trim();
  if (!token || token.includes("*")) {
    throw new Error("hubspot_access_token_unavailable");
  }

  const project = await findProjectById(WD_MIGRATION_WORKSPACE_ID, destinationProjectId);
  if (!project || project.archivedAt || project.reference !== destinationReference) {
    throw new Error("destination_project_mismatch");
  }
  const mappings = await listHubSpotProjectMappings(
    WD_MIGRATION_WORKSPACE_ID,
    WD_MIGRATION_INTEGRATION_ID,
  );
  const mapping = mappings.find((row) => row.hubspotProjectId === slug) ?? null;
  assertExplicitMappedDestination({
    slug,
    destinationProjectId,
    destinationReference,
    mapping: mapping
      ? {
          hubspotProjectId: mapping.hubspotProjectId,
          status: mapping.status,
          evoProjectId: mapping.evoProjectId,
        }
      : null,
  });

  const snapshotsById = new Map<string, ReturnType<typeof snapshotFromHubSpotProperties>>();
  let searchTotal = 0;
  for (const propertyName of ["wd_project", "hs_content_membership_notes", "wd_broker_assigned"]) {
    let after: string | undefined;
    do {
      const page = await hubspotSearchPage({
        accessToken: token,
        propertyName,
        slug,
        properties: [...WD_MIGRATION_HUBSPOT_PROPERTIES],
        after,
      });
      if (propertyName === "wd_project") {
        searchTotal = page.total;
      }
      for (const result of page.results) {
        if (result.id && !snapshotsById.has(result.id)) {
          snapshotsById.set(result.id, snapshotFromHubSpotProperties(result.id, result.properties));
        }
      }
      after = page.after;
      await sleep(250);
    } while (after);
  }
  const snapshots = [...snapshotsById.values()];

  const existing = await findLeadsForHubSpotGvPilotDedupe({
    workspaceId: WD_MIGRATION_WORKSPACE_ID,
    projectId: destinationProjectId,
    emailNormalizedValues: snapshots
      .map((snapshot) => snapshot.emailNormalized)
      .filter((email): email is string => Boolean(email)),
    hubspotContactIds: snapshots.map((snapshot) => snapshot.hubspotContactId),
  });
  const existingLeads = existing.map((lead) => existingLeadFromRecord(lead));

  const cohortCounts = {
    in_wd_project: 0,
    single_project: 0,
    multi_project: 0,
    notes_only: 0,
    broker_only: 0,
    missing_name: 0,
    email_match: 0,
    identity_conflict: 0,
    hubspot_id_match: 0,
    new_write_eligible: 0,
    notes_conflict: 0,
    missing_email_and_phone: 0,
    cmp_product: 0,
  };
  const newIds: string[] = [];
  for (const snapshot of snapshots) {
    const inProject = snapshot.projectValues.includes(slug);
    if (inProject) {
      cohortCounts.in_wd_project += 1;
      if (snapshot.projectValues.length === 1) {
        cohortCounts.single_project += 1;
      } else {
        cohortCounts.multi_project += 1;
      }
    }
    const eligibility = evaluateWdProjectEligibility(snapshot, existingLeads, slug);
    for (const reason of eligibility.exclusions) {
      if (reason in cohortCounts) {
        cohortCounts[reason as keyof typeof cohortCounts] += 1;
      }
    }
    if (eligibility.writeEligible) {
      cohortCounts.new_write_eligible += 1;
      newIds.push(snapshot.hubspotContactId);
    }
  }

  const selected = selectSortedContactIds(newIds);
  const exceptions = buildExceptionBuckets(snapshots, existingLeads, slug);
  exceptions.destinationProjectId = destinationProjectId;
  exceptions.destinationReference = destinationReference;
  assertManifestHasNoPii(exceptions);

  const dir = path.join(process.cwd(), WD_MIGRATION_MANIFEST_DIR);
  await mkdir(dir, { recursive: true });
  await mkdir(path.join(process.cwd(), WD_MIGRATION_EXCEPTION_DIR), { recursive: true });
  await writeFile(
    path.join(process.cwd(), WD_MIGRATION_EXCEPTION_DIR, `${slug}.json`),
    `${JSON.stringify(exceptions, null, 2)}\n`,
  );

  let idChecksum: string | null = null;
  if (selected.length > 0) {
    const manifest = {
      name: manifestName,
      version: 1 as const,
      portalId: WD_MIGRATION_PORTAL_ID,
      workspaceId: WD_MIGRATION_WORKSPACE_ID,
      destinationProjectId,
      destinationReference,
      slug,
      sourceHubSpotProjectId: slug,
      size: selected.length,
      selection: {
        pool: "new_write_eligible" as const,
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
          "cmp_product",
          "missing_email_and_phone",
        ],
      },
      hubspotContactIds: selected,
      idChecksum: checksumContactIds(selected),
    };
    assertManifestHasNoPii(manifest);
    await writeFile(path.join(dir, `${manifestName}.json`), `${JSON.stringify(manifest, null, 2)}\n`);
    idChecksum = manifest.idChecksum;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        slug,
        destinationProjectId,
        destinationReference,
        searchTotal,
        scanned: snapshots.length,
        cohortCounts,
        exceptionCounts: exceptions.counts,
        exceptionCount: exceptions.records.length,
        manifestName: selected.length > 0 ? manifestName : null,
        manifestSize: selected.length,
        idChecksum,
      },
      null,
      2,
    ),
  );
  const mongoose = await import("mongoose");
  await mongoose.default.disconnect().catch(() => undefined);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown_error";
  console.error(JSON.stringify({ ok: false, error: message }));
  process.exit(1);
});
