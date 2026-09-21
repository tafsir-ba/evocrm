/**
 * Ensure a user has an active ProjectGrant on a project (idempotent).
 * Does not send invitation emails. Optionally sets project.assignedTo.
 *
 * Usage:
 *   npx tsx scripts/ensure-project-grant.ts --dry-run \
 *     --email=maelle@evo-home.ch --project-id=<id> --role=contributor
 *   npx tsx scripts/ensure-project-grant.ts \
 *     --email=maelle@evo-home.ch --project-id=<id> --role=contributor \
 *     --actor-id=<userObjectId> --set-assigned-to
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
  const setAssignedTo = process.argv.includes("--set-assigned-to");
  const email = readArg("email");
  const projectId = readArg("project-id");
  const workspaceIdArg = readArg("workspace-id");
  const role = readArg("role") ?? "contributor";
  const actorId = readArg("actor-id");

  if (!email || !projectId) {
    throw new Error("Provide --email=<addr> and --project-id=<objectId>.");
  }
  if (!dryRun && !actorId) {
    throw new Error("Provide --actor-id=<userObjectId> when applying.");
  }

  const { findUserByEmail, findUserById } = await import(
    "../server/repositories/users"
  );
  const { findProjectById, updateProject } = await import(
    "../server/repositories/projects"
  );
  const { findWorkspaceById } = await import("../server/repositories/workspaces");
  const {
    findProjectGrant,
    createProjectGrant,
    reactivateProjectGrant,
    updateProjectGrantRole,
  } = await import("../server/repositories/project-grants");
  const { isProjectRoleKey } = await import("../server/permissions/project-roles");
  const { createAuditLog } = await import("../server/audit/create-audit-log");

  if (!isProjectRoleKey(role)) {
    throw new Error(`Invalid --role=${role}. Use project_admin|contributor|viewer.`);
  }

  const user = await findUserByEmail(email);
  if (!user) {
    throw new Error(`No user found for email ${email}`);
  }

  let workspaceId = workspaceIdArg;
  if (!workspaceId) {
    const { connectDb } = await import("../server/db/mongoose");
    const mongoose = await import("mongoose");
    await connectDb();
    const raw = await mongoose.default.connection
      .collection("projects")
      .findOne({ _id: new mongoose.default.Types.ObjectId(projectId) });
    if (!raw?.workspaceId) {
      throw new Error(`Project ${projectId} not found.`);
    }
    workspaceId = String(raw.workspaceId);
  }

  const workspace = await findWorkspaceById(workspaceId);
  const project = await findProjectById(workspaceId, projectId);
  if (!workspace || !project) {
    throw new Error("Workspace or project not found.");
  }
  if (project.archivedAt) {
    throw new Error("Project is archived.");
  }

  const actor = actorId ? await findUserById(actorId) : null;
  if (!dryRun && !actor) {
    throw new Error(`Actor ${actorId} not found.`);
  }

  const existing = await findProjectGrant(workspaceId, projectId, user.id);
  const plan = {
    email: user.email,
    userId: user.id,
    workspace: { id: workspace.id, slug: workspace.slug, name: workspace.name },
    project: { id: project.id, name: project.name, reference: project.reference },
    role,
    existingStatus: existing?.status ?? null,
    existingRole: existing?.projectRole ?? null,
    setAssignedTo,
    currentAssignedTo: project.assignedTo,
    dryRun,
  };
  console.log("[ensure-project-grant] plan", plan);

  if (dryRun) {
    console.log("[ensure-project-grant] dry-run complete (no writes)");
    const mongoose = await import("mongoose");
    await mongoose.default.disconnect().catch(() => undefined);
    return;
  }

  let grantId: string;
  let action: "created" | "reactivated" | "role_updated" | "unchanged";

  if (!existing) {
    const grant = await createProjectGrant({
      workspaceId,
      projectId,
      userId: user.id,
      projectRole: role,
      grantedBy: actorId!,
    });
    grantId = grant.id;
    action = "created";
  } else if (existing.status === "removed" || existing.status === "suspended") {
    const grant = await reactivateProjectGrant(
      workspaceId,
      projectId,
      user.id,
      role,
      actorId!,
    );
    if (!grant) {
      throw new Error("Failed to reactivate project grant.");
    }
    grantId = grant.id;
    action = "reactivated";
  } else if (existing.projectRole !== role) {
    const grant = await updateProjectGrantRole(
      workspaceId,
      projectId,
      user.id,
      role,
    );
    if (!grant) {
      throw new Error("Failed to update project grant role.");
    }
    grantId = grant.id;
    action = "role_updated";
  } else {
    grantId = existing.id;
    action = "unchanged";
  }

  if (setAssignedTo && project.assignedTo !== user.id) {
    await updateProject(workspaceId, projectId, { assignedTo: user.id });
  }

  if (action !== "unchanged") {
    await createAuditLog({
      workspaceId,
      actorId: actorId!,
      action:
        action === "role_updated"
          ? "project_grant.role_changed"
          : "project_grant.created",
      entityType: "project_grant",
      entityId: grantId,
      after: {
        projectId,
        userId: user.id,
        projectRole: role,
        via: "ensure-project-grant",
        action,
      },
    });
  }

  console.log("[ensure-project-grant] complete", {
    grantId,
    action,
    assignedTo: setAssignedTo ? user.id : project.assignedTo,
  });

  const mongoose = await import("mongoose");
  await mongoose.default.disconnect().catch(() => undefined);
}

main().catch(async (error: unknown) => {
  console.error("[ensure-project-grant] failed", error);
  const mongoose = await import("mongoose");
  await mongoose.default.disconnect().catch(() => undefined);
  process.exit(1);
});
