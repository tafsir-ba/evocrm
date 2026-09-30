/**
 * Ensure the production "Satigny duplex" project + locked website integration.
 *
 * Usage:
 *   NODE_ENV=development npx tsx scripts/ensure-satigny-duplex-website-capture.ts --confirm-write
 *   NODE_ENV=development npx tsx scripts/ensure-satigny-duplex-website-capture.ts --confirm-write --rotate
 *
 * Creates (idempotent):
 *   - Company "Eva Homes SA" (if missing)
 *   - Project name "Satigny duplex", reference satigny_duplex
 *   - Website integration "evahomes.ch — Satigny duplex" locked to that project
 *
 * Prints the raw API key only when a new key is minted (create or --rotate).
 * Store it as CRM_API_KEY on evahomes.ch (server-side only).
 *
 * Requires production Mongo + the same INTEGRATION_API_KEY_PEPPER / NEXTAUTH_SECRET
 * the CRM app uses to hash API keys.
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

const WORKSPACE_SLUG = "evo-crm";
const PROJECT_NAME = "Satigny duplex";
const PROJECT_REFERENCE = "satigny_duplex";
const INTEGRATION_NAME = "evahomes.ch — Satigny duplex";
const COMPANY_NAME = "Eva Homes SA";
const ACTOR_FALLBACK_EMAIL = "tafsir@evo-home.ch";

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
}

function readFlag(argv: string[], name: string): boolean {
  return argv.includes(`--${name}`);
}

async function main(): Promise<void> {
  bootstrapEnv();
  const argv = process.argv.slice(2);
  const confirm = readFlag(argv, "confirm-write");
  const rotate = readFlag(argv, "rotate");

  if (!confirm) {
    throw new Error(
      "Refusing to write without --confirm-write. Pass --confirm-write to create/update.",
    );
  }

  const { connectDb } = await import("../server/db/mongoose");
  const { WorkspaceModel } = await import("../models/workspace");
  const { UserModel } = await import("../models/user");
  const {
    createCompany,
    findActiveCompanyByNormalizedName,
  } = await import("../server/repositories/companies");
  const {
    findProjectByReference,
    findProjects,
  } = await import("../server/repositories/projects");
  const { createProjectForWorkspace } = await import("../server/services/projects");
  const {
    createIntegrationForWorkspace,
    listIntegrationsForWorkspace,
    rotateIntegrationApiKeyForWorkspace,
    updateIntegrationForWorkspace,
  } = await import("../server/services/integrations");

  await connectDb();

  const workspace = await WorkspaceModel.findOne({ slug: WORKSPACE_SLUG }).lean();
  if (!workspace) {
    throw new Error(`workspace_not_found:${WORKSPACE_SLUG}`);
  }
  const workspaceId = workspace._id.toString();

  const actor =
    (await UserModel.findOne({ email: ACTOR_FALLBACK_EMAIL }).lean()) ||
    (await UserModel.findOne({}).lean());
  if (!actor) {
    throw new Error("no_actor_user");
  }
  const actorId = actor._id.toString();

  let company = await findActiveCompanyByNormalizedName(
    workspaceId,
    COMPANY_NAME.trim().toLowerCase(),
  );
  if (!company) {
    company = await createCompany({
      workspaceId,
      name: COMPANY_NAME,
      nameNormalized: COMPANY_NAME.trim().toLowerCase(),
      website: "https://evahomes.ch",
      createdBy: actorId,
    });
    console.log(JSON.stringify({ createdCompanyId: company.id }));
  } else {
    console.log(JSON.stringify({ reusedCompanyId: company.id }));
  }

  let project = await findProjectByReference(workspaceId, PROJECT_REFERENCE);
  if (!project) {
    const aliases = await findProjects(workspaceId, { includeArchived: true });
    project =
      aliases.find((item) => item.name.trim().toLowerCase() === PROJECT_NAME.toLowerCase()) ??
      null;
  }

  if (!project) {
    project = await createProjectForWorkspace(workspaceId, actorId, {
      name: PROJECT_NAME,
      reference: PROJECT_REFERENCE,
      projectType: "resale_mandate",
      commercialStage: "live",
      website: "https://evahomes.ch/satigny-duplex",
      city: "Satigny",
      country: "Switzerland",
      address: "1242 Satigny",
      description:
        "L’Échappée · Duplex 5.5 PCE · Satigny — leads from evahomes.ch/satigny-duplex",
      companies: [
        {
          companyId: company.id,
          role: "developer",
          isPrimary: true,
        },
      ],
      location: {
        countryCode: "CH",
        countryName: "Switzerland",
        cantonCode: "GE",
        cantonName: "Geneva",
        municipality: "Satigny",
        postalCode: "1242",
        normalizedAddress: "1242 Satigny",
        latitude: 46.215,
        longitude: 6.04,
        precision: "locality",
        sourceUrl: "https://evahomes.ch/satigny-duplex",
        confidence: "high",
        reviewStatus: "verified",
      },
    });
    console.log(JSON.stringify({ createdProjectId: project.id, reference: project.reference }));
  } else {
    console.log(JSON.stringify({ reusedProjectId: project.id, reference: project.reference }));
  }

  const integrations = await listIntegrationsForWorkspace(workspaceId, {
    type: "website",
    includeArchived: false,
  });
  let integration = integrations.find((item) => item.name === INTEGRATION_NAME) ?? null;

  let apiKey: string | undefined;
  if (!integration) {
    const created = await createIntegrationForWorkspace(workspaceId, actorId, {
      type: "website",
      name: INTEGRATION_NAME,
      defaultProjectId: project.id,
      allowProjectOverride: false,
    });
    integration = created.integration;
    apiKey = created.apiKey;
    console.log(JSON.stringify({ createdIntegrationId: integration.id }));
  } else {
    await updateIntegrationForWorkspace(workspaceId, integration.id, actorId, {
      defaultProjectId: project.id,
      allowProjectOverride: false,
      status: "active",
    });
    console.log(JSON.stringify({ reusedIntegrationId: integration.id }));
    if (rotate) {
      const rotated = await rotateIntegrationApiKeyForWorkspace(
        workspaceId,
        integration.id,
        actorId,
      );
      apiKey = rotated.apiKey;
      console.log(JSON.stringify({ rotatedIntegrationId: integration.id }));
    }
  }

  if (apiKey) {
    console.log(
      JSON.stringify({
        apiKey,
        note: "Copy once into evahomes.ch CRM_API_KEY. Also set CRM_SYNC_ENABLED=true, CRM_PROJECT_REFERENCE=satigny_duplex.",
      }),
    );
  } else {
    console.log(
      JSON.stringify({
        apiKey: null,
        note: "No new key minted. Re-run with --rotate to issue a fresh evocrm_whk_… key (shown once).",
      }),
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
