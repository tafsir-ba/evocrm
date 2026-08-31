/**
 * One-time HubSpot → EvoHome CMP lead intelligence backfill.
 * Cohort: EvoHome leads with CMP project membership.
 * Fills blank or HubSpot-owned industry, job title, state/region, and company.
 * Never overwrites manual CRM edits. Never changes memberships, status, source
 * dates, dripping, campaigns, or consent.
 *
 * Usage:
 *   npm run enrich:hubspot-cmp-lead-intelligence
 *   npm run enrich:hubspot-cmp-lead-intelligence -- --workspace-id=<id>
 *   npm run enrich:hubspot-cmp-lead-intelligence -- --execute --confirm-write
 *
 * Dry-run by default. Writes require --execute --confirm-write.
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
  if (!process.env.NODE_ENV || process.env.NODE_ENV === "production") {
    Object.assign(process.env, { NODE_ENV: "development" });
  }
}

function argValue(argv: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = argv.find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

async function main(): Promise<void> {
  bootstrapEnv();
  const argv = process.argv.slice(2);
  const workspaceId = argValue(argv, "workspace-id")?.trim() ?? null;
  const execute = argv.includes("--execute");
  const confirmWrite = argv.includes("--confirm-write");
  const reportOut =
    argValue(argv, "report-out") ??
    path.join(
      "migrations/hubspot-wd-project",
      execute ? "cmp-lead-intelligence-execute.json" : "cmp-lead-intelligence-dry-run.json",
    );

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

  const publicReport = {
    mode: report.mode,
    persisted: report.persisted,
    persistReason: report.persistReason,
    cmpLeadsScanned: report.cmpLeadsScanned,
    hubspotMatches: report.hubspotMatches,
    unmatchedContacts: report.unmatchedContacts,
    unmatchedMissingId: report.unmatchedMissingId,
    unmatchedNotFound: report.unmatchedNotFound,
    unmatchedAmbiguousEmail: report.unmatchedAmbiguousEmail,
    errors: report.errors,
    valuesAvailable: report.valuesAvailable,
    wouldChangeRecords: report.wouldChangeRecords,
    wouldChangeFields: report.wouldChangeFields,
    filledRecords: report.filledRecords,
    filledFields: report.filledFields,
    skippedUnchanged: report.skippedUnchanged,
    skippedPreserved: report.skippedPreserved,
    enrollCampaigns: false,
    mutateLeadProject: false,
    mutateLeadStatus: false,
    mutateConsent: false,
    samples: report.samples,
  };

  console.log(JSON.stringify(publicReport, null, 2));

  await mkdir(path.dirname(reportOut), { recursive: true });
  await writeFile(reportOut, `${JSON.stringify(publicReport, null, 2)}\n`);

  const mongoose = await import("mongoose");
  await mongoose.default.disconnect().catch(() => undefined);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown_error";
  console.error(JSON.stringify({ ok: false, error: message }));
  process.exit(1);
});
