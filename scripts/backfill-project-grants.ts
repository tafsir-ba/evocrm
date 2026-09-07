/**
 * Backfill ProjectGrant rows for project creators and non-admin workspace members.
 * Idempotent. Does not send invitation emails.
 *
 * Usage:
 *   npm run migrate:project-grants -- --dry-run
 *   npm run migrate:project-grants -- --actor-id=<userObjectId>
 *   npm run migrate:project-grants -- --workspace-id=<id> --actor-id=<userObjectId>
 *
 * Accepts MONGODB_URI or MONGO_URL. Defaults to database `evocrm` when the URI has no db path.
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
    process.env.NEXT_PUBLIC_APP_URL = "https://crm.evo-home.ch";
  }
  if (!process.env.NODE_ENV || process.env.NODE_ENV === "production") {
    Object.assign(process.env, { NODE_ENV: "development" });
  }
}

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() || undefined : undefined;
}

async function main(): Promise<void> {
  bootstrapEnv();
  const dryRun = process.argv.includes("--dry-run");
  const workspaceId = readArg("workspace-id");
  const actorId = readArg("actor-id");
  if (!dryRun && !actorId) {
    throw new Error(
      "Provide --actor-id=<userObjectId> when applying project grant backfill.",
    );
  }
  const { backfillProjectGrants } = await import(
    "../server/services/project-grants-backfill"
  );
  const result = await backfillProjectGrants({
    workspaceId,
    actorId: actorId ?? "000000000000000000000001",
    dryRun,
  });
  console.log("[migrate:project-grants] complete", result);
  const mongoose = await import("mongoose");
  await mongoose.default.disconnect().catch(() => undefined);
}

main().catch(async (error: unknown) => {
  console.error("[migrate:project-grants] failed", error);
  const mongoose = await import("mongoose");
  await mongoose.default.disconnect().catch(() => undefined);
  process.exit(1);
});
