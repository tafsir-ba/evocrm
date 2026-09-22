/**
 * Live local verification for Notes → lead Notes/Files surface.
 * Creates a safe QA lead, publishes a session with a media doc, then
 * asserts the same query filters as the Lead Notes and Files tabs.
 *
 * Run: NODE_OPTIONS='--conditions=react-server' npx tsx scripts/verify-notes-lead-surface-live.ts
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { connectDb } from "@/server/db/mongoose";
import { WorkspaceModel } from "@/models/workspace";
import { UserModel } from "@/models/user";
import { LeadModel } from "@/models/lead";
import { ProjectModel } from "@/models/project";
import { DocumentModel } from "@/models/document";
import { VisitSessionModel } from "@/models/visit-session";
import { findDictionaryItemByTypeAndKey } from "@/server/repositories/dictionary-items";
import { findActivities } from "@/server/repositories/activities";
import { findDocuments } from "@/server/repositories/documents";
import { publishVisitSessionForWorkspace } from "@/server/services/visit-sessions";

const ARTIFACTS = "/opt/cursor/artifacts";

// Load .env without dotenv package
for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && !process.env[match[1]!]) {
    process.env[match[1]!] = match[2]!.replace(/^"|"$/g, "");
  }
}

async function main() {
  await connectDb();
  const workspace = await WorkspaceModel.findOne({ slug: "demo-agency" }).lean();
  if (!workspace) throw new Error("demo-agency workspace missing — seed first");
  const workspaceId = workspace._id.toString();

  const user = await UserModel.findOne({ email: "demo@evocrm.local" }).lean();
  if (!user) throw new Error("demo user missing");
  const actorId = user._id.toString();

  const project = await ProjectModel.findOne({ workspaceId: workspace._id }).lean();
  if (!project) throw new Error("demo project missing");
  const projectId = project._id.toString();

  const leadStatus =
    (await findDictionaryItemByTypeAndKey(workspaceId, "lead_status", "new")) ??
    (await findDictionaryItemByTypeAndKey(workspaceId, "lead_status", "open"));
  if (!leadStatus) throw new Error("lead_status dictionary missing");

  const lead = await LeadModel.findOneAndUpdate(
    { workspaceId: workspace._id, email: "qa-notes-surface@example.com" },
    {
      $setOnInsert: {
        workspaceId: workspace._id,
        projectId: project._id,
        fullName: "QA Notes Surface Lead",
        email: "qa-notes-surface@example.com",
        createdBy: user._id,
        statusId: leadStatus.id,
      },
      $set: { notes: null },
    },
    { upsert: true, new: true },
  ).lean();
  if (!lead) throw new Error("could not upsert QA lead");
  const leadId = lead._id.toString();

  const noteType = await findDictionaryItemByTypeAndKey(
    workspaceId,
    "activity_type",
    "note",
  );
  if (!noteType) throw new Error("note activity type missing");

  const session = await VisitSessionModel.create({
    workspaceId: workspace._id,
    leadId: lead._id,
    projectId: project._id,
    createdBy: user._id,
    title: "Live surface verification",
    status: "open",
    messages: [
      {
        id: randomUUID(),
        kind: "text",
        text: "Buyer liked the balcony and asked about parking.",
        documentId: null,
        language: "en",
        status: "ready",
        error: null,
        createdBy: user._id,
        createdAt: new Date(),
      },
    ],
    documentIds: [],
    aiDraft: {
      version: 1,
      summary: "Buyer liked the balcony and asked about parking.",
      customerRequirements: "",
      propertyDiscussed: "",
      questionsObjections: "",
      actions: "",
      nextSteps: [],
      needsConfirmation: [],
      language: "en",
      sourceMessageIds: [],
      editedBody: null,
      createdAt: new Date(),
    },
    draftHistory: [],
  });

  const doc = await DocumentModel.create({
    workspaceId: workspace._id,
    linkedEntityType: "visit_session",
    linkedEntityId: session._id,
    uploadedBy: user._id,
    fileName: "balcony-qa.jpg",
    mimeType: "image/jpeg",
    fileSize: 1024,
    bucket: "qa-local",
    storageKey: `qa/${randomUUID()}.jpg`,
    status: "active",
  });

  session.documentIds = [doc._id];
  await session.save();

  const published = await publishVisitSessionForWorkspace(
    workspaceId,
    session._id.toString(),
    actorId,
    {
      mirrorToLeadNotes: true,
      registerLeadNoteActivity: true,
      createTasksFromNextSteps: false,
    },
  );

  // Exact Notes-tab query path
  const notes = await findActivities(workspaceId, {
    leadId,
    typeId: noteType.id,
    page: 1,
    pageSize: 50,
    includeArchived: false,
  });

  // Exact Files-tab query path
  const files = await findDocuments(workspaceId, {
    linkedEntityType: "lead",
    linkedEntityId: leadId,
    page: 1,
    pageSize: 50,
    includeArchived: false,
  });

  const refreshedLead = await LeadModel.findById(lead._id).lean();
  const result = {
    leadId,
    leadEmail: "qa-notes-surface@example.com",
    sessionId: session._id.toString(),
    noteActivityId: published.noteActivityId,
    notesTabCount: notes.total,
    notesTabTitles: notes.activities.map((a) => a.title),
    notesTabTypeIds: notes.activities.map((a) => a.typeId),
    filesTabCount: files.total,
    filesTabNames: files.documents.map((d) => d.fileName),
    leadNotesMirror: refreshedLead?.notes?.slice(0, 240) ?? null,
    pass:
      notes.total >= 1 &&
      notes.activities.every((a) => a.typeId === noteType.id) &&
      files.total >= 1 &&
      files.documents.some((d) => d.fileName === "balcony-qa.jpg") &&
      Boolean(refreshedLead?.notes?.includes(`[Note session:${session._id.toString()}]`)),
  };

  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const out = path.join(ARTIFACTS, "notes_lead_surface_live_verify.json");
  fs.writeFileSync(out, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  if (!result.pass) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
