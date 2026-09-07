/**
 * Backfill ProjectGrant rows so existing members keep project access after
 * ProjectGrant enforcement is enabled.
 *
 * - Ensures each project creator has an active project_admin grant
 * - Ensures each active non-owner/admin workspace member has a grant on every
 *   project in that workspace (contributor if they have project:update, else viewer)
 *
 * Usage:
 *   npm run migrate:project-grants -- --dry-run
 *   npm run migrate:project-grants
 *
 * Accepts MONGODB_URI or MONGO_URL.
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

async function main(): Promise<void> {
  bootstrapEnv();
  const dryRun = process.argv.includes("--dry-run");
  const { backfillProjectGrants } = await import(
    "../server/services/project-grants-backfill"
  );
  const result = await backfillProjectGrants({ dryRun });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
