import { describe, expect, it } from "vitest";

import {
  notesSessionMirrorMarker,
  upsertLeadNotesMirror,
} from "@/lib/notes-lead-mirror";

describe("upsertLeadNotesMirror", () => {
  it("appends a session-scoped block", () => {
    const next = upsertLeadNotesMirror({
      existingNotes: "Prior",
      sessionId: "abc123",
      body: "Hello",
    });
    expect(next).toContain("Prior");
    expect(next).toContain(notesSessionMirrorMarker("abc123"));
    expect(next).toContain("Hello");
  });

  it("replaces the same session block on republish without duplicating", () => {
    const first = upsertLeadNotesMirror({
      existingNotes: "",
      sessionId: "abc123",
      body: "First",
    });
    const second = upsertLeadNotesMirror({
      existingNotes: first,
      sessionId: "abc123",
      body: "Second",
    });
    expect(second.match(/\[Note session:abc123\]/g)?.length).toBe(1);
    expect(second).toContain("Second");
    expect(second).not.toContain("First");
  });
});
