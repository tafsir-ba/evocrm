/**
 * One-time / ops repair: backfill Note + Files surface for published Notes sessions.
 *
 * Usage:
 *   npx tsx scripts/backfill-notes-lead-surface.ts --workspace <slug> [--session <id>] [--dry-run]
 *
 * Safe defaults: dry-run unless --apply is passed. Does not archive or delete Visits.
 */
import fs from "node:fs";

import { connectDb } from "@/server/db/mongoose";
import { VisitSessionModel } from "@/models/visit-session";
import { WorkspaceModel } from "@/models/workspace";
import { MembershipModel } from "@/models/membership";
import { backfillVisitSessionLeadSurfaceForWorkspace } from "@/server/services/visit-sessions";

for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && !process.env[match[1]!]) {
    process.env[match[1]!] = match[2]!.replace(/^"|"$/g, "");
  }
}
async function main() {
  const args = process.argv.slice(2);
  const workspaceSlug = readArg(args, "--workspace");
  const sessionId = readArg(args, "--session");
  const apply = args.includes("--apply");

  if (!workspaceSlug) {
    console.error(
      "Usage: npx tsx scripts/backfill-notes-lead-surface.ts --workspace <slug> [--session <id>] [--apply]",
    );
    process.exit(1);
  }

  await connectDb();
  const workspace = await WorkspaceModel.findOne({ slug: workspaceSlug }).lean();
  if (!workspace) {
    console.error(`Workspace not found: ${workspaceSlug}`);
    process.exit(1);
  }
  const workspaceId = workspace._id.toString();

  const ownerMembership = await MembershipModel.findOne({
    workspaceId: workspace._id,
    status: "active",
  })
    .sort({ createdAt: 1 })
    .lean();
  if (!ownerMembership) {
    console.error("No active membership found to act as backfill actor.");
    process.exit(1);
  }
  const actorId = ownerMembership.userId.toString();

  const query: Record<string, unknown> = {
    workspaceId: workspace._id,
    archivedAt: null,
    publishedAt: { $ne: null },
    $or: [{ noteActivityId: null }, { noteActivityId: { $exists: false } }],
  };
  if (sessionId) {
    query._id = sessionId;
  }

  const sessions = await VisitSessionModel.find(query)
    .select({ _id: 1, leadId: 1, title: 1, activityId: 1, noteActivityId: 1, documentIds: 1 })
    .limit(sessionId ? 1 : 500)
    .lean();

  console.log(
    JSON.stringify(
      {
        workspace: workspaceSlug,
        mode: apply ? "apply" : "dry-run",
        candidateCount: sessions.length,
        candidates: sessions.map((s) => ({
          id: s._id.toString(),
          leadId: s.leadId?.toString(),
          title: s.title,
          activityId: s.activityId?.toString() ?? null,
          noteActivityId: s.noteActivityId?.toString() ?? null,
          documentCount: (s.documentIds ?? []).length,
        })),
      },
      null,
      2,
    ),
  );

  if (!apply) {
    console.log("Dry-run only. Re-run with --apply to write Note activities and re-link files.");
    return;
  }

  for (const session of sessions) {
    const id = session._id.toString();
    try {
      const updated = await backfillVisitSessionLeadSurfaceForWorkspace(
        workspaceId,
        id,
        actorId,
      );
      console.log(
        JSON.stringify({
          ok: true,
          sessionId: id,
          noteActivityId: updated.noteActivityId,
          activityId: updated.activityId,
        }),
      );
    } catch (error) {
      console.error(
        JSON.stringify({
          ok: false,
          sessionId: id,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }
}

function readArg(args: string[], flag: string): string | null {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  return args[index + 1] ?? null;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
