import { describe, expect, it, vi } from "vitest";

import {
  buildConversationExport,
  canUseWebShare,
  downloadNotesExport,
} from "@/lib/notes-share";
import { formatVisitSessionFallbackTitle } from "@/lib/visit-notes";

describe("notes share helpers", () => {
  it("builds a conversation export without private media URLs", () => {
    const text = buildConversationExport({
      title: "Parking call",
      leadName: "Ada Buyer",
      unitLabel: "PROP-4B · Riverside",
      messages: [
        {
          kind: "text",
          text: "Discussed parking",
          createdAt: "2026-09-22T10:00:00.000Z",
        },
        {
          kind: "photo",
          text: null,
          createdAt: "2026-09-22T10:01:00.000Z",
        },
        {
          kind: "transcript",
          text: "duplicate",
          createdAt: "2026-09-22T10:02:00.000Z",
        },
      ],
      summary: "Buyer cares about parking.",
    });
    expect(text).toContain("Parking call");
    expect(text).toContain("Ada Buyer");
    expect(text).toContain("Discussed parking");
    expect(text).toContain("Photo attached");
    expect(text).toContain("Buyer cares about parking.");
    expect(text).not.toContain("duplicate");
    expect(text).not.toMatch(/https?:\/\//);
  });

  it("reports web share availability from navigator.share", () => {
    const original = navigator.share;
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: undefined,
    });
    expect(canUseWebShare()).toBe(false);
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: vi.fn(),
    });
    expect(canUseWebShare()).toBe(true);
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: original,
    });
  });

  it("downloadNotesExport creates a text blob download", () => {
    const click = vi.fn();
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => "blob:note-export") as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL;

    const createElement = vi.spyOn(document, "createElement");
    const anchor = document.createElement("a");
    anchor.click = click;
    createElement.mockReturnValueOnce(anchor);

    downloadNotesExport({ fileName: "note", text: "hello" });

    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(anchor.download).toBe("note.txt");
    expect(click).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:note-export");

    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    createElement.mockRestore();
  });
});

describe("neutral note title fallback", () => {
  it("uses Note · not Visit ·", () => {
    expect(formatVisitSessionFallbackTitle("2026-09-22T10:00:00.000Z")).toMatch(
      /^Note ·/,
    );
    expect(formatVisitSessionFallbackTitle("2026-09-22T10:00:00.000Z")).not.toMatch(
      /Visit/,
    );
  });
});
