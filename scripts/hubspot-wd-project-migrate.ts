/**
 * Parameterized HubSpot wd_project migration runner.
 *
 * Defaults to dry-run. Writes require all three:
 *   --execute --confirm-write --manifest=<name>
 *
 * Never prints PII. HubSpot contact IDs only.
 * Never routes to Grosvenor Vistas or EvoHome General.
 */
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

async function main(): Promise<void> {
  bootstrapEnv();
  const { runHubSpotWdProjectMigration } = await import(
    "../server/services/hubspot-wd-project-migration"
  );
  const report = await runHubSpotWdProjectMigration({ argv: process.argv.slice(2) });
  const { records: _records, ...summary } = report;
  console.log(JSON.stringify(summary, null, 2));
  const mongoose = await import("mongoose");
  await mongoose.default.disconnect().catch(() => undefined);
  if (report.aborted || report.unexpected > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown_error";
  console.error(JSON.stringify({ ok: false, error: message }));
  process.exit(1);
});
