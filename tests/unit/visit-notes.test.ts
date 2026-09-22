import { describe, expect, it } from "vitest";

import {
  formatVisitDraftBody,
  isVisitAudioMimeType,
  isVisitMediaMimeType,
  isVisitVideoMimeType,
  MAX_VISIT_MEDIA_FILE_SIZE_BYTES,
  validateVisitMediaFileClient,
  visitMediaKindFromMime,
} from "@/lib/visit-notes";
import {
  appendVisitMessageInputSchema,
  createVisitSessionInputSchema,
  publishVisitSessionInputSchema,
} from "@/server/validation/visit-sessions";
import { documentUploadUrlInputSchema } from "@/server/validation/documents";

describe("visit notes media constants", () => {
  it("classifies accepted MIME types", () => {
    expect(isVisitAudioMimeType("audio/webm")).toBe(true);
    expect(isVisitVideoMimeType("video/mp4")).toBe(true);
    expect(isVisitMediaMimeType("image/jpeg")).toBe(true);
    expect(visitMediaKindFromMime("audio/mpeg")).toBe("audio");
    expect(visitMediaKindFromMime("application/pdf")).toBeNull();
  });

  it("rejects oversized or unsupported client files", () => {
    const huge = {
      name: "clip.webm",
      type: "video/webm",
      size: MAX_VISIT_MEDIA_FILE_SIZE_BYTES + 1,
    } as File;
    expect(validateVisitMediaFileClient(huge)).toMatch(/maximum size/i);

    const bad = { name: "x.txt", type: "text/plain", size: 10 } as File;
    expect(validateVisitMediaFileClient(bad)).toMatch(/unsupported/i);
  });
});

describe("visit session validation", () => {
  it("requires leadId on create", () => {
    const parsed = createVisitSessionInputSchema.safeParse({
      leadId: "507f1f77bcf86cd799439011",
    });
    expect(parsed.success).toBe(true);
  });

  it("requires text for text messages and documentId for media", () => {
    expect(
      appendVisitMessageInputSchema.safeParse({ kind: "text", text: "" }).success,
    ).toBe(false);
    expect(
      appendVisitMessageInputSchema.safeParse({
        kind: "photo",
        documentId: "507f1f77bcf86cd799439011",
      }).success,
    ).toBe(true);
    expect(appendVisitMessageInputSchema.safeParse({ kind: "audio" }).success).toBe(
      false,
    );
  });

  it("accepts publish options", () => {
    const parsed = publishVisitSessionInputSchema.safeParse({
      createTasksFromNextSteps: true,
      mirrorToLeadNotes: false,
    });
    expect(parsed.success).toBe(true);
  });
});

describe("visit_session document uploads", () => {
  it("allows larger media size for visit_session links", () => {
    const ok = documentUploadUrlInputSchema.safeParse({
      linkedEntityType: "visit_session",
      linkedEntityId: "507f1f77bcf86cd799439011",
      fileName: "clip.webm",
      mimeType: "video/webm",
      fileSize: 40 * 1024 * 1024,
      visibility: "private",
    });
    expect(ok.success).toBe(true);

    const tooBig = documentUploadUrlInputSchema.safeParse({
      linkedEntityType: "visit_session",
      linkedEntityId: "507f1f77bcf86cd799439011",
      fileName: "clip.webm",
      mimeType: "video/webm",
      fileSize: 60 * 1024 * 1024,
      visibility: "private",
    });
    expect(tooBig.success).toBe(false);

    const leadStillCapped = documentUploadUrlInputSchema.safeParse({
      linkedEntityType: "lead",
      linkedEntityId: "507f1f77bcf86cd799439011",
      fileName: "clip.webm",
      mimeType: "video/webm",
      fileSize: 40 * 1024 * 1024,
      visibility: "private",
    });
    expect(leadStillCapped.success).toBe(false);
  });

  it("rejects visit audio/video MIME on non-visit entities", () => {
    const leadAudio = documentUploadUrlInputSchema.safeParse({
      linkedEntityType: "lead",
      linkedEntityId: "507f1f77bcf86cd799439011",
      fileName: "note.webm",
      mimeType: "audio/webm",
      fileSize: 1024,
      visibility: "private",
    });
    expect(leadAudio.success).toBe(false);

    const propertyVideo = documentUploadUrlInputSchema.safeParse({
      linkedEntityType: "property",
      linkedEntityId: "507f1f77bcf86cd799439011",
      fileName: "tour.mp4",
      mimeType: "video/mp4",
      fileSize: 1024,
      visibility: "private",
    });
    expect(propertyVideo.success).toBe(false);

    const visitAudio = documentUploadUrlInputSchema.safeParse({
      linkedEntityType: "visit_session",
      linkedEntityId: "507f1f77bcf86cd799439011",
      fileName: "note.webm",
      mimeType: "audio/webm",
      fileSize: 1024,
      visibility: "private",
    });
    expect(visitAudio.success).toBe(true);
  });
});

describe("formatVisitDraftBody", () => {
  it("prefers edited body and otherwise formats structured sections", () => {
    const edited = formatVisitDraftBody({
      version: 1,
      summary: "A",
      customerRequirements: "B",
      propertyDiscussed: "C",
      questionsObjections: "D",
      actions: "E",
      nextSteps: [],
      needsConfirmation: [],
      language: "en",
      sourceMessageIds: ["m1"],
      editedBody: "Agent edited draft",
      createdAt: new Date(),
    });
    expect(edited).toBe("Agent edited draft");

    const structured = formatVisitDraftBody({
      version: 2,
      summary: "Nice flat",
      customerRequirements: "3 beds",
      propertyDiscussed: "Cressy",
      questionsObjections: "Parking?",
      actions: "Sent brochure",
      nextSteps: [
        {
          text: "Call back",
          ownerName: "Alex",
          dueDate: new Date("2026-10-01T00:00:00.000Z"),
          needsConfirmation: false,
        },
      ],
      needsConfirmation: ["Budget"],
      language: "en",
      sourceMessageIds: ["m1"],
      editedBody: null,
      createdAt: new Date(),
    });
    expect(structured).toContain("Summary");
    expect(structured).toContain("Nice flat");
    expect(structured).toContain("Call back");
    expect(structured).toContain("Budget");
  });
});
