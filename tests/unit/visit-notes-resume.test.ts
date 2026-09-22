import { describe, expect, it } from "vitest";

import {
  pickResumeVisitSession,
  visitSessionHasSubstantiveContent,
} from "@/lib/visit-notes";

function session(partial: {
  id: string;
  status?: string;
  createdAt: string;
  updatedAt?: string;
  title?: string | null;
  messages?: Array<{ kind: string; text?: string | null; status?: string }>;
  draftBody?: string | null;
  aiDraft?: unknown;
}) {
  return {
    status: "open",
    messages: [],
    title: null,
    draftBody: null,
    aiDraft: null,
    updatedAt: partial.updatedAt ?? partial.createdAt,
    ...partial,
  };
}

describe("pickResumeVisitSession", () => {
  it("prefers last-opened even when an empty open session has a newer updatedAt", () => {
    const emptyTouched = session({
      id: "empty-1652",
      status: "open",
      createdAt: "2026-09-22T14:52:00.000Z",
      updatedAt: "2026-09-22T20:00:00.000Z",
      messages: [],
    });
    const qa = session({
      id: "qa-2122",
      status: "published",
      createdAt: "2026-09-22T19:22:00.000Z",
      updatedAt: "2026-09-22T19:30:00.000Z",
      title: "QA photo check",
      messages: [
        { kind: "text", text: "QA ONLY", status: "ready" },
        { kind: "photo", status: "ready" },
      ],
    });

    expect(
      pickResumeVisitSession([emptyTouched, qa], { lastOpenedId: "qa-2122" })?.id,
    ).toBe("qa-2122");
  });

  it("prefers latest substantive over an older empty open session (updatedAt touch cannot win)", () => {
    const emptyOld = session({
      id: "empty-1652",
      status: "open",
      createdAt: "2026-09-22T14:52:00.000Z",
      // Backfill/touch made updatedAt newest — must still lose.
      updatedAt: "2026-09-22T21:40:00.000Z",
      messages: [],
    });
    const qaEarlier = session({
      id: "qa-2113",
      status: "draft",
      createdAt: "2026-09-22T19:13:00.000Z",
      updatedAt: "2026-09-22T19:20:00.000Z",
      messages: [{ kind: "text", text: "Draft v1", status: "ready" }],
    });
    const qaLatest = session({
      id: "qa-2122",
      status: "published",
      createdAt: "2026-09-22T19:22:00.000Z",
      updatedAt: "2026-09-22T19:35:00.000Z",
      title: "QA media",
      messages: [
        { kind: "text", text: "QA ONLY", status: "ready" },
        { kind: "video", status: "ready" },
      ],
    });

    expect(visitSessionHasSubstantiveContent(emptyOld)).toBe(false);
    expect(visitSessionHasSubstantiveContent(qaLatest)).toBe(true);
    expect(pickResumeVisitSession([emptyOld, qaEarlier, qaLatest])?.id).toBe(
      "qa-2122",
    );
  });

  it("falls back to newest empty open when nothing substantive exists", () => {
    const older = session({
      id: "a",
      createdAt: "2026-09-22T10:00:00.000Z",
    });
    const newer = session({
      id: "b",
      createdAt: "2026-09-22T11:00:00.000Z",
    });
    expect(pickResumeVisitSession([older, newer])?.id).toBe("b");
  });
});
