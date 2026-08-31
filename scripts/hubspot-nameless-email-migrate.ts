/**
 * Sequential nameless-email manifest migration. Stops on safety failures.
 */
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
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

function parseJsonFromOutput(output: string): Record<string, unknown> {
  const start = output.indexOf("{");
  if (start < 0) {
    throw new Error("command_output_not_json");
  }
  return JSON.parse(output.slice(start)) as Record<string, unknown>;
}

async function main(): Promise<void> {
  const dir = path.join(process.cwd(), "migrations/hubspot-wd-project");
  const progressPath = path.join(dir, "nameless-email-migration-progress.json");
  let progress: {
    completed: string[];
    failed: Array<{ manifest: string; reason: string }>;
  } = { completed: [], failed: [] };
  try {
    progress = JSON.parse(await readFile(progressPath, "utf8")) as typeof progress;
  } catch {
    // fresh run
  }

  const entries = (await readdir(dir))
    .filter((name) => name.startsWith("nameless-") && name.endsWith(".json"))
    .filter((name) => !name.includes("cohort") && !name.includes("progress"))
    .sort();

  for (const file of entries) {
    const manifestName = file.replace(/\.json$/, "");
    if (progress.completed.includes(manifestName)) {
      continue;
    }
    const result = spawnSync(
      "npm",
      ["run", "migrate:hubspot-wd-project", "--", "--execute", "--confirm-write", `--manifest=${manifestName}`],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: process.env,
        timeout: 4 * 60 * 60 * 1000,
        maxBuffer: 64 * 1024 * 1024,
      },
    );
    const combined = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    let report: Record<string, unknown>;
    try {
      report = parseJsonFromOutput(combined);
    } catch {
      progress.failed.push({ manifest: manifestName, reason: "output_parse_failed" });
      await mkdir(dir, { recursive: true });
      await writeFile(progressPath, `${JSON.stringify(progress, null, 2)}\n`);
      console.error(JSON.stringify({ ok: false, stoppedOn: manifestName, reason: "output_parse_failed" }));
      process.exit(1);
    }

    const aborted = Boolean(report.aborted);
    const unexpected = Number(report.unexpected ?? 0);
    const reconciliation = (report.reconciliation ?? {}) as Record<string, unknown>;
    const enrollmentCount = Number(reconciliation.enrollmentCount ?? 0);
    const generalProjectTouched = Boolean(reconciliation.generalProjectTouched);

    if (aborted || unexpected > 0 || enrollmentCount > 0 || generalProjectTouched) {
      progress.failed.push({
        manifest: manifestName,
        reason: `safety_failure:aborted=${aborted},unexpected=${unexpected},enroll=${enrollmentCount},general=${generalProjectTouched}`,
      });
      await writeFile(progressPath, `${JSON.stringify(progress, null, 2)}\n`);
      console.error(JSON.stringify({ ok: false, stoppedOn: manifestName, report: { aborted, unexpected, enrollmentCount, generalProjectTouched } }));
      process.exit(1);
    }

    progress.completed.push(manifestName);
    await writeFile(progressPath, `${JSON.stringify(progress, null, 2)}\n`);
    console.log(
      JSON.stringify({
        ok: true,
        manifest: manifestName,
        created: report.created,
        skipped: report.skipped,
        completedCount: progress.completed.length,
      }),
    );
  }

  console.log(JSON.stringify({ ok: true, totalCompleted: progress.completed.length, failed: progress.failed }));
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "unknown" }));
  process.exit(1);
});
