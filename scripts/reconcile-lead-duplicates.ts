/**
 * Reconcile duplicate active leads before unique email/idempotency indexes.
 *
 * Selects a canonical record, remaps associations, archives duplicates
 * (never deletes), writes before/after audit, then creates the intended
 * unique indexes. Does not enroll campaigns.
 *
 * Usage:
 *   npm run reconcile:lead-duplicates
 *   npm run reconcile:lead-duplicates -- --execute --confirm-write --actor-id=<userId>
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
  const mongoose = await import("mongoose");
  mongoose.default.set("autoIndex", false);
  const execute = process.argv.includes("--execute");
  const confirmWrite =
    process.argv.includes("--confirm-write") ||
    process.argv.includes("--confirm-write=true");
  const skipIndexes = process.argv.includes("--skip-indexes");
  const actorId = readArg("actor-id");
  const dryRun = !execute;

  if (execute && !confirmWrite) {
    throw new Error("execute_requires_confirm_write");
  }
  if (execute && !actorId) {
    throw new Error("execute_requires_actor_id");
  }

  const { reconcileLeadDuplicates } = await import(
    "../server/services/lead-duplicate-reconciliation"
  );
  const result = await reconcileLeadDuplicates({
    dryRun,
    actorId: actorId ?? "000000000000000000000000",
    skipIndexes,
  });
  console.log(JSON.stringify(result, null, 2));
  if (!dryRun && !result.writeGate.ready) {
    process.exitCode = 1;
  }
}

main()
  .then(async () => {
    const mongoose = await import("mongoose");
    await mongoose.default.disconnect().catch(() => undefined);
  })
  .catch(async (error: unknown) => {
    const message = error instanceof Error ? error.message : "unknown_error";
    console.error(JSON.stringify({ ok: false, error: message }));
    const mongoose = await import("mongoose");
    await mongoose.default.disconnect().catch(() => undefined);
    process.exit(1);
  });
