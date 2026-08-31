/**
 * Build PII-free batch reconciliation from persisted migration run records.
 */
import { writeFile } from "node:fs/promises";
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

async function main(): Promise<void> {
  bootstrapEnv();
  const manifestName = readArg(process.argv.slice(2), "manifest");
  if (!manifestName) {
    throw new Error("usage: --manifest=<name>");
  }

  const { WD_MIGRATION_MANIFEST_DIR, WD_MIGRATION_WORKSPACE_ID } = await import(
    "../lib/hubspot-wd-project-migration"
  );
  const { connectDb } = await import("../server/db/mongoose");
  const mongoose = await import("mongoose");

  await connectDb();
  const db = mongoose.default.connection.db;
  if (!db) {
    throw new Error("mongo_db_unavailable");
  }

  const run = await db.collection("hubspotmigrationruns").findOne(
    {
      workspaceId: new mongoose.default.Types.ObjectId(WD_MIGRATION_WORKSPACE_ID),
      manifestName,
      mode: "execute",
      status: "completed",
    },
    { sort: { completedAt: -1 } },
  );
  if (!run) {
    throw new Error(`migration_run_not_found:${manifestName}`);
  }

  const reconciliation = (run.reconciliation ?? {}) as Record<string, unknown>;
  const records = (run.records ?? []) as Array<{
    hubspotContactId: string;
    leadId?: { toString(): string } | string | null;
    outcome: string;
  }>;

  const sourceToDestination = records
    .filter((record) => record.leadId)
    .map((record) => ({
      hubspotContactId: String(record.hubspotContactId),
      leadId:
        typeof record.leadId === "string"
          ? record.leadId
          : record.leadId?.toString() ?? null,
      outcome: record.outcome,
    }))
    .sort((a, b) => Number(a.hubspotContactId) - Number(b.hubspotContactId));

  const manifestSize = Array.isArray(run.hubspotContactIds)
    ? run.hubspotContactIds.length
    : sourceToDestination.length;
  const preExisting = Number(run.skippedCount ?? 0);

  const recon = {
    batch: manifestName,
    mode: "execute",
    created: run.createdCount ?? 0,
    skipped: run.skippedCount ?? 0,
    preExisting,
    updated: 0,
    conflict: 0,
    unexpected: run.unexpectedCount ?? 0,
    aborted: Boolean(run.aborted),
    destinationProjectId: run.destinationProjectId?.toString?.() ?? null,
    destinationLeadCount: reconciliation.destinationLeadCount ?? null,
    enrollmentCount: reconciliation.enrollmentCount ?? 0,
    campaignGuard: reconciliation.campaignGuard ?? null,
    generalProjectTouched: reconciliation.generalProjectTouched ?? false,
    wrongDestination: reconciliation.wrongDestination ?? 0,
    idMapCount: sourceToDestination.length,
    manifestSize,
    sourceToDestination,
  };

  const outPath = path.join(process.cwd(), WD_MIGRATION_MANIFEST_DIR, `${manifestName}-recon.json`);
  await writeFile(outPath, `${JSON.stringify(recon, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        ok: true,
        outPath,
        created: recon.created,
        skipped: recon.skipped,
        unexpected: recon.unexpected,
        aborted: recon.aborted,
        destinationLeadCount: recon.destinationLeadCount,
        enrollmentCount: recon.enrollmentCount,
        generalProjectTouched: recon.generalProjectTouched,
        idMapCount: recon.idMapCount,
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
