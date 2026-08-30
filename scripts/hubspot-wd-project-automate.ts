/**
 * Sequential HubSpot wd_project automation.
 * Creates explicit destinations, writes exception buckets, and migrates
 * only clean NEW contacts. Stops only on systemic safety failures.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { writeFileSync } from "node:fs";
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
  if (!process.env.NODE_ENV || process.env.NODE_ENV === "production") {
    process.env.NODE_ENV = "development";
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

function parseJsonFromOutput(output: string): Record<string, unknown> {
  const start = output.indexOf("{");
  if (start < 0) {
    throw new Error("command_output_not_json");
  }
  // Prefer the first complete JSON value; ignore trailing stderr noise.
  const slice = output.slice(start);
  try {
    return JSON.parse(slice) as Record<string, unknown>;
  } catch {
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let index = 0; index < slice.length; index += 1) {
      const ch = slice[index]!;
      if (inString) {
        if (escape) {
          escape = false;
        } else if (ch === "\\") {
          escape = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === "{") depth += 1;
      if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          return JSON.parse(slice.slice(0, index + 1)) as Record<string, unknown>;
        }
      }
    }
    throw new Error("command_output_not_json");
  }
}

function runTsx(script: string, args: string[], timeoutMs: number, logPath: string): Record<string, unknown> {
  const result = spawnSync("npx", ["tsx", script, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    timeout: timeoutMs,
    maxBuffer: 128 * 1024 * 1024,
  });
  const combined = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  writeFileSync(logPath, combined);
  if (result.error) {
    return {
      ok: false,
      error: `spawn_error:${result.error.message}`,
      signal: (result.signal as string | null) ?? null,
      _failed: true,
    };
  }
  if (result.status !== 0) {
    try {
      return {
        ...parseJsonFromOutput(combined),
        _failed: true,
        _status: result.status,
        signal: (result.signal as string | null) ?? null,
      };
    } catch {
      return {
        ok: false,
        error: `command_failed:${script}:${result.status}`,
        signal: (result.signal as string | null) ?? null,
        _failed: true,
      };
    }
  }
  return parseJsonFromOutput(result.stdout ?? combined);
}

async function disconnectMongo(): Promise<void> {
  const mongoose = await import("mongoose");
  if (mongoose.default.connection.readyState !== 0) {
    await mongoose.default.disconnect().catch(() => undefined);
  }
  const globalCache = globalThis as typeof globalThis & {
    __evocrmMongooseCache?: { conn: unknown; promise: unknown };
  };
  if (globalCache.__evocrmMongooseCache) {
    globalCache.__evocrmMongooseCache.conn = null;
    globalCache.__evocrmMongooseCache.promise = null;
  }
}

async function reconnectMongo(): Promise<void> {
  await disconnectMongo();
  const { connectDb } = await import("../server/db/mongoose");
  await connectDb();
}

type ProgressFile = {
  version: 1;
  stopped: boolean;
  stopReason: string | null;
  completed: Array<Record<string, unknown>>;
  skipped: Array<Record<string, unknown>>;
};

async function loadProgress(filePath: string): Promise<ProgressFile> {
  try {
    const raw = JSON.parse(await readFile(filePath, "utf8")) as ProgressFile;
    return {
      version: 1,
      stopped: Boolean(raw.stopped),
      stopReason: raw.stopReason ?? null,
      completed: Array.isArray(raw.completed) ? raw.completed : [],
      skipped: Array.isArray(raw.skipped) ? raw.skipped : [],
    };
  } catch {
    return { version: 1, stopped: false, stopReason: null, completed: [], skipped: [] };
  }
}

async function main(): Promise<void> {
  bootstrapEnv();
  const argv = process.argv.slice(2);
  const execute = argv.includes("--execute");
  const confirmWrite = argv.includes("--confirm-write");
  const commitProgress = argv.includes("--commit-progress");
  const maxProjects = Number(readArg(argv, "max-projects") || "0") || Number.POSITIVE_INFINITY;
  if (execute && !confirmWrite) {
    throw new Error("execute_requires_confirm_write");
  }

  const {
    WD_MIGRATION_FORBIDDEN_SLUG,
    WD_MIGRATION_GENERAL_PROJECT_ID,
    WD_MIGRATION_GV_PROJECT_ID,
    WD_MIGRATION_INTEGRATION_ID,
    WD_MIGRATION_PROGRESS_FILE,
    WD_MIGRATION_ROADMAP_FILE,
    WD_MIGRATION_WORKSPACE_ID,
    findUnresolvedAlias,
    isSystemicAutomationFailure,
    remainingRoadmapSlugs,
    stableProjectReference,
  } = await import("../lib/hubspot-wd-project-migration");
  type MasterProjectRoadmap = import("../lib/hubspot-wd-project-migration").MasterProjectRoadmap;
  const { findIntegrationById } = await import("../server/repositories/integrations");
  const { findProjects } = await import("../server/repositories/projects");
  const mongoose = await import("mongoose");

  const roadmap = JSON.parse(
    await readFile(path.join(process.cwd(), WD_MIGRATION_ROADMAP_FILE), "utf8"),
  ) as MasterProjectRoadmap;
  const progressPath = path.join(process.cwd(), WD_MIGRATION_PROGRESS_FILE);
  const progress = await loadProgress(progressPath);

  // Skip only checkpoint-completed slugs (not "mapped" alone). Setup maps before execute
  // finishes, so treating DB mappings as done would strand interrupted projects.
  const mappedSlugs = new Set<string>();
  for (const row of progress.completed) {
    if (typeof row.slug === "string") {
      mappedSlugs.add(row.slug);
    }
  }
  mappedSlugs.add(WD_MIGRATION_FORBIDDEN_SLUG);
  await disconnectMongo();

  const logDir = path.join("/tmp", "wd-automate-logs");
  await mkdir(logDir, { recursive: true });

  // Clear recoverable interruption stops so residual batches can resume.
  // Never auto-clear true destination / enrollment / idempotency safety failures.
  const stopReason = progress.stopReason ?? "";
  const recoverableStop =
    stopReason === "unexpected_results" ||
    stopReason === "execute_aborted:create_failed" ||
    stopReason === "execute_aborted:create_duplicate_unexpected";
  const unsafeStop =
    stopReason.includes("wrong_destination") ||
    stopReason.includes("grosvenor") ||
    stopReason.includes("evo_general") ||
    stopReason.includes("idempotency_breach") ||
    stopReason.includes("enrollment_breach") ||
    stopReason.includes("campaign_guard") ||
    stopReason.includes("automation");
  if (progress.stopped && recoverableStop && !unsafeStop) {
    progress.stopped = false;
    progress.stopReason = null;
    await writeFile(progressPath, `${JSON.stringify(progress, null, 2)}\n`);
  }

  const remaining = remainingRoadmapSlugs(roadmap, mappedSlugs);
  const rowBySlug = new Map(roadmap.rows.map((row) => [row.slug, row]));
  const completedThisRun: Record<string, unknown>[] = [];
  let processed = 0;

  for (const slug of remaining) {
    if (processed >= maxProjects) {
      break;
    }
    const row = rowBySlug.get(slug);
    if (!row || row.classification !== "real_project") {
      progress.skipped.push({ slug, reason: "not_canonical_real_development" });
      continue;
    }
    const name = row.display_name;
    const reference = stableProjectReference(slug);
    await reconnectMongo();
    const projects = await findProjects(WD_MIGRATION_WORKSPACE_ID, { includeArchived: true });
    const alias = findUnresolvedAlias({ slug, name, reference, projects });
    if (alias) {
      const fallback =
        alias.id === WD_MIGRATION_GV_PROJECT_ID || alias.id === WD_MIGRATION_GENERAL_PROJECT_ID;
      progress.skipped.push({
        slug,
        reason: fallback ? "alias_of_fallback_unresolved" : "existing_alias_unresolved",
        aliasId: alias.id,
        aliasReference: alias.reference,
      });
      await writeFile(progressPath, `${JSON.stringify(progress, null, 2)}\n`);
      await disconnectMongo();
      continue;
    }

    await disconnectMongo();
    const setup = runTsx(
      "scripts/hubspot-wd-project-setup.ts",
      ["--slug", slug, "--name", name, "--reference", reference, "--confirm-write"],
      120_000,
      path.join(logDir, `${slug}-setup.log`),
    );
    if (setup.ok !== true) {
      const error = String(setup.error ?? "setup_failed");
      if (error.includes("existing_alias")) {
        progress.skipped.push({ slug, reason: "existing_alias_unresolved", error });
        await writeFile(progressPath, `${JSON.stringify(progress, null, 2)}\n`);
        continue;
      }
      progress.stopped = true;
      progress.stopReason = error.includes("fallback")
        ? "wrong_destination"
        : `runner_gate_failure:${error}`;
      await writeFile(progressPath, `${JSON.stringify(progress, null, 2)}\n`);
      break;
    }
    const destination = setup.destination as {
      id: string;
      reference: string;
    };

    const manifestName = `${slug}-batch-01`;
    await disconnectMongo();
    const selected = runTsx(
      "scripts/hubspot-wd-project-select.ts",
      [
        "--slug",
        slug,
        "--destination",
        destination.id,
        "--reference",
        destination.reference,
        "--manifest",
        manifestName,
      ],
      20 * 60_000,
      path.join(logDir, `${slug}-select.log`),
    );
    if (selected.ok !== true) {
      progress.stopped = true;
      progress.stopReason = `runner_gate_failure:${String(selected.error ?? "select_failed")}`;
      await writeFile(progressPath, `${JSON.stringify(progress, null, 2)}\n`);
      break;
    }

    const manifestSize = Number(selected.manifestSize ?? 0);
    let created = 0;
    let skipped = 0;
    let destCount = 0;
    if (manifestSize > 0) {
      await disconnectMongo();
      const dry = runTsx(
        "scripts/hubspot-wd-project-migrate.ts",
        ["--manifest", manifestName],
        20 * 60_000,
        path.join(logDir, `${slug}-dry.log`),
      );
      const gate = dry.liveWriteGate as { ready?: boolean; blockers?: string[] } | undefined;
      if (!gate?.ready) {
        progress.stopped = true;
        progress.stopReason = `runner_gate_failure:${(gate?.blockers ?? []).join(",") || "dry_run"}`;
        await writeFile(progressPath, `${JSON.stringify(progress, null, 2)}\n`);
        break;
      }
      if (execute) {
        await disconnectMongo();
        const exec = runTsx(
          "scripts/hubspot-wd-project-migrate.ts",
          ["--execute", "--confirm-write", "--manifest", manifestName],
          120 * 60_000,
          path.join(logDir, `${slug}-execute.log`),
        );
        const recon = (exec.reconciliation ?? {}) as Record<string, unknown>;
        created = Number(exec.created ?? 0);
        skipped = Number(exec.skipped ?? 0);
        destCount = Number(recon.destinationLeadCount ?? 0);
        const destId = String(exec.destinationProjectId ?? "");
        const processedOk = created + skipped === manifestSize && Number(exec.unexpected ?? 0) === 0;
        const wrongDestination =
          recon.destinationIsGv === true ||
          recon.destinationIsGeneral === true ||
          destId === WD_MIGRATION_GV_PROJECT_ID ||
          destId === WD_MIGRATION_GENERAL_PROJECT_ID ||
          (destId.length > 0 && destId !== destination.id);
        const enrollmentBreach =
          Number(recon.enrollmentCount ?? 0) > 0 ||
          Number(
            (recon.campaignGuard as { automaticallyEnrollable?: number } | undefined)
              ?.automaticallyEnrollable ?? 0,
          ) > 0;
        const abortReason = String(exec.abortReason ?? "");
        const systemic =
          wrongDestination ||
          enrollmentBreach ||
          abortReason.includes("wrong_destination") ||
          abortReason.includes("idempotency_breach") ||
          abortReason.includes("automation") ||
          abortReason.includes("campaign_guard");
        if (systemic || (!processedOk && exec.aborted === true) || Number(exec.unexpected ?? 0) > 0) {
          progress.stopped = true;
          progress.stopReason = wrongDestination
            ? recon.destinationIsGv === true || destId === WD_MIGRATION_GV_PROJECT_ID
              ? "wrong_destination:grosvenor_fallback_not_allowed"
              : "wrong_destination:evo_general_not_allowed"
            : enrollmentBreach
              ? "enrollment_breach"
              : abortReason.includes("idempotency")
                ? "idempotency_breach"
                : exec.aborted === true
                  ? `execute_aborted:${abortReason || "aborted"}`
                  : "unexpected_results";
          await writeFile(progressPath, `${JSON.stringify(progress, null, 2)}\n`);
          break;
        }
        if (!processedOk) {
          // Partial interruption with clean destination: keep going after residual select next loop
          // by not marking completed; stop only if we cannot prove destination integrity.
          if (destCount < created || wrongDestination || enrollmentBreach) {
            progress.stopped = true;
            progress.stopReason = "unexpected_results";
            await writeFile(progressPath, `${JSON.stringify(progress, null, 2)}\n`);
            break;
          }
          // Re-queue same slug by not adding to completed/mapped; force another pass.
          console.log(
            JSON.stringify({
              progress: {
                slug,
                partial: true,
                created,
                skipped,
                manifestSize,
                destinationLeadCount: destCount,
              },
            }),
          );
          await writeFile(progressPath, `${JSON.stringify(progress, null, 2)}\n`);
          // Retry same slug once by continuing loop without consuming mappedSlugs.
          await disconnectMongo();
          const retry = runTsx(
            "scripts/hubspot-wd-project-select.ts",
            [
              "--slug",
              slug,
              "--destination",
              destination.id,
              "--reference",
              destination.reference,
              "--manifest",
              `${slug}-batch-01`,
            ],
            20 * 60_000,
            path.join(logDir, `${slug}-select-retry.log`),
          );
          const retrySize = Number(retry.manifestSize ?? 0);
          if (retry.ok === true && retrySize > 0) {
            await disconnectMongo();
            const retryExec = runTsx(
              "scripts/hubspot-wd-project-migrate.ts",
              ["--execute", "--confirm-write", "--manifest", `${slug}-batch-01`],
              120 * 60_000,
              path.join(logDir, `${slug}-execute-retry.log`),
            );
            const retryRecon = (retryExec.reconciliation ?? {}) as Record<string, unknown>;
            created += Number(retryExec.created ?? 0);
            skipped += Number(retryExec.skipped ?? 0);
            destCount = Number(retryRecon.destinationLeadCount ?? destCount);
            if (
              Number(retryExec.unexpected ?? 0) > 0 ||
              retryExec.aborted === true ||
              retryRecon.destinationIsGv === true ||
              retryRecon.destinationIsGeneral === true ||
              Number(retryRecon.enrollmentCount ?? 0) > 0
            ) {
              progress.stopped = true;
              progress.stopReason = `execute_aborted:${String(retryExec.abortReason ?? "retry_failed")}`;
              await writeFile(progressPath, `${JSON.stringify(progress, null, 2)}\n`);
              break;
            }
          }
        }
      }
    }

    let integration = null as Awaited<ReturnType<typeof findIntegrationById>> | null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        await reconnectMongo();
        integration = await findIntegrationById(
          WD_MIGRATION_WORKSPACE_ID,
          WD_MIGRATION_INTEGRATION_ID,
        );
        break;
      } catch (error) {
        await disconnectMongo();
        await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
        if (attempt === 4) {
          throw error;
        }
      }
    }
    if (
      integration?.defaultProjectId !== WD_MIGRATION_GV_PROJECT_ID ||
      integration.allowProjectOverride
    ) {
      progress.stopped = true;
      progress.stopReason = "integration_defaults_changed";
      await writeFile(progressPath, `${JSON.stringify(progress, null, 2)}\n`);
      break;
    }

    const summary = {
      slug,
      name,
      reference,
      destinationProjectId: destination.id,
      manifestSize,
      created: execute ? created : 0,
      destinationLeadCount: execute ? destCount : 0,
      exceptionCount: Number(selected.exceptionCount ?? 0),
      exceptionCounts: selected.exceptionCounts ?? {},
      searchTotal: selected.searchTotal ?? null,
      dryRunOnly: !execute,
    };
    progress.completed.push(summary);
    completedThisRun.push(summary);
    mappedSlugs.add(slug);
    await writeFile(progressPath, `${JSON.stringify(progress, null, 2)}\n`);
    processed += 1;
    console.log(JSON.stringify({ progress: summary }));

    if (commitProgress) {
      spawnSync(
        "git",
        [
          "add",
          "migrations/hubspot-wd-project",
        ],
        { cwd: process.cwd() },
      );
      spawnSync(
        "git",
        ["commit", "-m", `chore(hubspot): automate ${slug} clean batch and exceptions`],
        { cwd: process.cwd() },
      );
      spawnSync("git", ["push", "-u", "origin", "HEAD"], { cwd: process.cwd() });
    }
  }

  await mongoose.default.disconnect().catch(() => undefined);
  const report = {
    ok: !progress.stopped || !isSystemicAutomationFailure(progress.stopReason),
    stopped: progress.stopped,
    stopReason: progress.stopReason,
    remaining: remainingRoadmapSlugs(roadmap, mappedSlugs).length - processed,
    completedThisRun,
    completedTotal: progress.completed.length,
    skippedTotal: progress.skipped.length,
  };
  console.log(JSON.stringify(report, null, 2));
  if (progress.stopped && isSystemicAutomationFailure(progress.stopReason)) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown_error";
  console.error(JSON.stringify({ ok: false, error: message }));
  process.exit(1);
});
