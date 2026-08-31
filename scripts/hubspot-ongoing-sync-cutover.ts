/**
 * Cutover helper for the ongoing HubSpot → EvoHome lead sync.
 * Never prints PII. Does not subscribe HubSpot webhooks.
 *
 *   npm run cutover:hubspot-ongoing -- --workspace-id=... --integration-id=... --dry-run --cutover-at=ISO
 *   npm run cutover:hubspot-ongoing -- --workspace-id=... --integration-id=... --verify-dry-run
 *   npm run cutover:hubspot-ongoing -- --workspace-id=... --integration-id=... --activate
 *
 * Mutations still require HUBSPOT_ONGOING_SYNC_RELEASE_GATE=enabled and
 * HUBSPOT_ONGOING_SYNC_WEBHOOK_MUTATE=true. This script only prepares the cursor.
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

function argValue(argv: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = argv.find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

function hasFlag(argv: string[], name: string): boolean {
  return argv.includes(`--${name}`);
}

async function main(): Promise<void> {
  bootstrapEnv();
  const argv = process.argv.slice(2);
  const workspaceId = argValue(argv, "workspace-id");
  const integrationId = argValue(argv, "integration-id");
  if (!workspaceId || !integrationId) {
    throw new Error("workspace-id and integration-id are required");
  }

  const { findIntegrationById } = await import("../server/repositories/integrations");
  const {
    prepareHubSpotOngoingCutover,
    runHubSpotOngoingCutoverDryRun,
    getHubSpotOngoingSyncObservability,
  } = await import("../server/services/hubspot-ongoing-sync");

  const integration = await findIntegrationById(workspaceId, integrationId);
  if (!integration || integration.type !== "hubspot") {
    throw new Error("hubspot_integration_not_found");
  }

  const cutoverAtRaw = argValue(argv, "cutover-at");
  const cutoverAt = cutoverAtRaw ? new Date(cutoverAtRaw) : hasFlag(argv, "dry-run") ? new Date() : undefined;

  if (!process.env.HUBSPOT_ONGOING_SYNC_RELEASE_GATE) {
    process.env.HUBSPOT_ONGOING_SYNC_RELEASE_GATE = "dry-run";
  }

  let cursor = await prepareHubSpotOngoingCutover({
    workspaceId,
    integrationId,
    portalId: integration.externalAccountId ?? "",
    cutoverAt,
  });

  let dryRunSummary: Record<string, unknown> | undefined;
  if (hasFlag(argv, "dry-run")) {
    const summary = await runHubSpotOngoingCutoverDryRun({
      integration,
      cursor,
    });
    dryRunSummary = {
      received: summary.received,
      wouldCreate: summary.wouldCreate,
      wouldUpdate: summary.wouldUpdate,
      parked: summary.parked,
      failed: summary.failed,
      skipped: summary.skipped,
      duplicates: summary.duplicates,
      pages: summary.pages,
      searched: true,
      triggerAutomation: false,
    };
    cursor = await prepareHubSpotOngoingCutover({
      workspaceId,
      integrationId,
      portalId: integration.externalAccountId ?? "",
      dryRunSummary,
    });
  }

  if (hasFlag(argv, "verify-dry-run") || hasFlag(argv, "activate")) {
    cursor = await prepareHubSpotOngoingCutover({
      workspaceId,
      integrationId,
      portalId: integration.externalAccountId ?? "",
      verifyDryRun: hasFlag(argv, "verify-dry-run"),
      activate: hasFlag(argv, "activate"),
    });
  }

  const observability = await getHubSpotOngoingSyncObservability({
    workspaceId,
    integrationId,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        cursor: {
          status: cursor.status,
          cutoverAt: cursor.cutoverAt,
          dryRunVerifiedAt: cursor.dryRunVerifiedAt,
        },
        dryRunSummary,
        events: observability.events,
        gate: observability.gate,
        triggerAutomation: false,
      },
      null,
      2,
    ),
  );
}

main()
  .then(async () => {
    const mongoose = await import("mongoose");
    await mongoose.default.disconnect().catch(() => undefined);
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "unknown_error";
    console.error(JSON.stringify({ ok: false, error: message }));
    process.exit(1);
  });
