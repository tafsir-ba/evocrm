/**
 * Create an Evohome development project and an explicit HubSpot mapping.
 * Never maps to Grosvenor Vistas or EvoHome General.
 * Never changes HubSpot integration defaults.
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

async function main(): Promise<void> {
  bootstrapEnv();
  const argv = process.argv.slice(2);
  const slug = readArg(argv, "slug");
  const name = readArg(argv, "name");
  const reference = readArg(argv, "reference");
  const confirm = argv.includes("--confirm-write");
  if (!slug || !name || !reference || !confirm) {
    throw new Error("usage: --slug --name --reference --confirm-write");
  }

  const { compactLookupKey } = await import("../server/imports/import-normalizers");
  const {
    WD_MIGRATION_FORBIDDEN_SLUG,
    WD_MIGRATION_GENERAL_PROJECT_ID,
    WD_MIGRATION_GV_PROJECT_ID,
    WD_MIGRATION_INTEGRATION_ID,
    WD_MIGRATION_WORKSPACE_ID,
    assertExplicitMappedDestination,
  } = await import("../lib/hubspot-wd-project-migration");
  const { findIntegrationById } = await import("../server/repositories/integrations");
  const {
    findProjectByReference,
    findProjects,
  } = await import("../server/repositories/projects");
  const { createProjectForWorkspace } = await import("../server/services/projects");
  const {
    upsertHubSpotProjectMappingInventory,
  } = await import("../server/repositories/hubspot-project-mappings");
  const { saveHubSpotProjectMappingForWorkspace } = await import(
    "../server/services/hubspot-project-mapping"
  );

  if (slug === WD_MIGRATION_FORBIDDEN_SLUG) {
    throw new Error("setup_refused:grosvenor_slug");
  }

  const integration = await findIntegrationById(
    WD_MIGRATION_WORKSPACE_ID,
    WD_MIGRATION_INTEGRATION_ID,
  );
  if (!integration || integration.archivedAt || integration.status !== "active") {
    throw new Error("integration_not_active");
  }

  const existingProjects = await findProjects(WD_MIGRATION_WORKSPACE_ID, {
    includeArchived: true,
  });
  const slugKey = compactLookupKey(slug);
  const nameKey = compactLookupKey(name);
  const referenceKey = compactLookupKey(reference);
  const alias = existingProjects.find((project) => {
    const keys = [
      compactLookupKey(project.name),
      project.reference ? compactLookupKey(project.reference) : "",
    ].filter(Boolean);
    return keys.includes(slugKey) || keys.includes(nameKey) || keys.includes(referenceKey);
  });
  if (alias && alias.reference !== reference) {
    throw new Error(`setup_refused:existing_alias:${alias.id}`);
  }

  let project = await findProjectByReference(WD_MIGRATION_WORKSPACE_ID, reference);
  let created = false;
  if (!project) {
    project = await createProjectForWorkspace(WD_MIGRATION_WORKSPACE_ID, integration.createdBy, {
      name,
      reference,
      projectType: "development",
      description: `HubSpot wd_project source ${slug}`,
    });
    created = true;
  }

  if (project.id === WD_MIGRATION_GV_PROJECT_ID || project.id === WD_MIGRATION_GENERAL_PROJECT_ID) {
    throw new Error("setup_refused:fallback_destination");
  }

  await upsertHubSpotProjectMappingInventory({
    workspaceId: WD_MIGRATION_WORKSPACE_ID,
    integrationId: WD_MIGRATION_INTEGRATION_ID,
    projects: [{ hubspotProjectId: slug, hubspotProjectName: name }],
  });

  const mapping = await saveHubSpotProjectMappingForWorkspace({
    workspaceId: WD_MIGRATION_WORKSPACE_ID,
    integrationId: WD_MIGRATION_INTEGRATION_ID,
    actorId: integration.createdBy,
    hubspotProjectId: slug,
    status: "mapped",
    evoProjectId: project.id,
  });

  assertExplicitMappedDestination({
    slug,
    destinationProjectId: project.id,
    destinationReference: project.reference ?? reference,
    mapping: {
      hubspotProjectId: mapping.hubspotProjectId,
      status: mapping.status,
      evoProjectId: mapping.evoProjectId,
    },
  });

  const refreshed = await findIntegrationById(
    WD_MIGRATION_WORKSPACE_ID,
    WD_MIGRATION_INTEGRATION_ID,
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        created,
        slug,
        destination: {
          id: project.id,
          name: project.name,
          reference: project.reference,
          projectType: project.projectType,
          defaultDripCampaignId: project.defaultDripCampaignId,
        },
        mapping: {
          hubspotProjectId: mapping.hubspotProjectId,
          hubspotProjectName: mapping.hubspotProjectName,
          status: mapping.status,
          evoProjectId: mapping.evoProjectId,
        },
        integrationUnchanged: {
          defaultProjectId: refreshed?.defaultProjectId ?? null,
          allowProjectOverride: refreshed?.allowProjectOverride ?? null,
        },
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
