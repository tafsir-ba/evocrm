/**
 * Enrich existing HubSpot CMP leads with industry, job title, state/region,
 * and associated company. Fills blank or HubSpot-owned values only.
 * Never enrolls campaigns or drips.
 *
 * Usage:
 *   npm run enrich:hubspot-cmp-lead-intelligence
 *   npm run enrich:hubspot-cmp-lead-intelligence -- --workspace-id=<id>
 *   npm run enrich:hubspot-cmp-lead-intelligence -- --execute --confirm-write
 *
 * Dry-run by default. Writes require --execute --confirm-write.
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
  if (!process.env.NODE_ENV || process.env.NODE_ENV === "production") {
    Object.assign(process.env, { NODE_ENV: "development" });
  }
}

async function main(): Promise<void> {
  bootstrapEnv();
  const argv = process.argv.slice(2);
  const workspaceId =
    argv.find((arg) => arg.startsWith("--workspace-id="))?.split("=")[1]?.trim() ?? null;
  const execute = argv.includes("--execute");
  const confirmWrite = argv.includes("--confirm-write");

  if (execute && !confirmWrite) {
    throw new Error("Refusing to write: pass --confirm-write with --execute.");
  }

  const { runHubSpotCmpLeadIntelligenceEnrichment } = await import(
    "../server/services/hubspot-cmp-lead-intelligence"
  );
  const report = await runHubSpotCmpLeadIntelligenceEnrichment({
    workspaceId,
    execute,
    confirmWrite,
  });
  console.log(
    JSON.stringify(
      {
        mode: report.mode,
        persisted: report.persisted,
        persistReason: report.persistReason,
        scanned: report.scanned,
        eligible: report.eligible,
        applied: report.applied,
        skipped: report.skipped,
        notCmp: report.notCmp,
        missingContact: report.missingContact,
        enrollCampaigns: false,
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
