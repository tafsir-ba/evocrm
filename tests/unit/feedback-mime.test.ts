import { describe, expect, it } from "vitest";

import { resolveFeedbackImageMimeType } from "@/lib/feedback";

describe("feedback screenshot mime resolution", () => {
  it("accepts declared image/png mime type", () => {
    expect(
      resolveFeedbackImageMimeType({
        fileName: "shot.png",
        mimeType: "image/png",
      }),
    ).toBe("image/png");
  });

  it("falls back to extension when mime type is empty", () => {
    expect(
      resolveFeedbackImageMimeType({
        fileName: "shot.jpeg",
        mimeType: "",
      }),
    ).toBe("image/jpeg");
  });

  it("rejects unsupported extensions", () => {
    expect(
      resolveFeedbackImageMimeType({
        fileName: "notes.txt",
        mimeType: "text/plain",
      }),
    ).toBeNull();
  });
});
