/** Summarize email-name policy migration wave totals — HubSpot IDs only in detail files. */
import { readFile, readdir, writeFile } from "node:fs/promises";
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

async function main(): Promise<void> {
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  const dir = path.join(process.cwd(), "migrations/hubspot-wd-project");
  const { WD_MIGRATION_WORKSPACE_ID } = await import("../lib/hubspot-wd-project-migration");
  const mongoose = await import("mongoose");
  const raw = process.env.MONGO_URL || process.env.MONGODB_URI || "";
  const uri = raw.includes("/?") ? raw.replace("/?", "/evocrm?") : raw.replace(/\/?$/, "/evocrm");
  await mongoose.default.connect(uri);
  const db = mongoose.default.connection.db!;

  const progressPath = path.join(dir, "nameless-email-migration-progress.json");
  let progress = { completed: [] as string[], failed: [] as unknown[] };
  try {
    progress = JSON.parse(await readFile(progressPath, "utf8")) as typeof progress;
  } catch {
    // no progress yet
  }

  const runs = await db
    .collection("hubspotmigrationruns")
    .find({
      workspaceId: new mongoose.default.Types.ObjectId(WD_MIGRATION_WORKSPACE_ID),
      manifestName: /^nameless-/,
      mode: "execute",
    })
    .sort({ completedAt: -1, createdAt: -1 })
    .toArray();

  const latestByManifest = new Map<string, (typeof runs)[number]>();
  for (const run of runs) {
    const name = String(run.manifestName ?? "");
    if (!latestByManifest.has(name)) {
      latestByManifest.set(name, run);
    }
  }

  let created = 0;
  let skipped = 0;
  let unexpected = 0;
  let abortedRuns = 0;
  for (const run of latestByManifest.values()) {
    created += Number(run.createdCount ?? 0);
    skipped += Number(run.skippedCount ?? 0);
    unexpected += Number(run.unexpectedCount ?? 0);
    if (run.aborted) {
      abortedRuns += 1;
    }
  }

  const reconcile = JSON.parse(
    await readFile(path.join(dir, "email-name-policy-reconciliation.json"), "utf8"),
  ) as {
    after: { counts: Record<string, number> };
    overlaps: { counts: Record<string, number> };
  };

  const enroll = await db.collection("campaignenrollments").countDocuments({
    workspaceId: new mongoose.default.Types.ObjectId(WD_MIGRATION_WORKSPACE_ID),
    "attributes.integration.inboundSource": "hubspot-wd-project",
  });

  const summary = {
    version: 1,
    generatedAt: new Date().toISOString(),
    policy: "email_bearing_missing_name_reclassification_v2",
    migration: {
      manifestsCompleted: progress.completed.length,
      created,
      skipped,
      preExisting: skipped,
      unexpected,
      abortedRuns,
      enrollmentCount: enroll,
    },
    held: {
      no_project_signal: reconcile.after.counts.held_no_project_signal,
    },
    overlaps: reconcile.overlaps.counts,
    gatesPassed:
      unexpected === 0 &&
      abortedRuns === 0 &&
      enroll === 0 &&
      reconcile.overlaps.counts.eligible_vs_cmp_cohort === 0,
  };

  const outPath = path.join(dir, "email-name-policy-migration-summary.json");
  await writeFile(outPath, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, outPath, summary }, null, 2));

  await mongoose.default.disconnect();
  if (!summary.gatesPassed && progress.failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "unknown" }));
  process.exit(1);
});
