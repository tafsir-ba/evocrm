import { describe, expect, it } from "vitest";

import { MAX_FEEDBACK_REQUEST_BYTES } from "@/server/feedback/constants";
import { assertFeedbackContentLength } from "@/server/feedback/request-guards";
import { AppError } from "@/server/errors";

describe("assertFeedbackContentLength", () => {
  it("allows requests within the upload cap", () => {
    expect(() =>
      assertFeedbackContentLength(
        new Request("http://localhost/api/feedback", {
          method: "POST",
          headers: { "Content-Length": String(MAX_FEEDBACK_REQUEST_BYTES) },
        }),
      ),
    ).not.toThrow();
  });

  it("rejects requests above the upload cap before parsing", () => {
    expect(() =>
      assertFeedbackContentLength(
        new Request("http://localhost/api/feedback", {
          method: "POST",
          headers: {
            "Content-Length": String(MAX_FEEDBACK_REQUEST_BYTES + 1),
          },
        }),
      ),
    ).toThrowError(
      expect.objectContaining<Partial<AppError>>({
        code: "VALIDATION_ERROR",
        message: "Request body is too large.",
      }),
    );
  });

  it("skips the check when Content-Length is absent", () => {
    expect(() =>
      assertFeedbackContentLength(
        new Request("http://localhost/api/feedback", { method: "POST" }),
      ),
    ).not.toThrow();
  });
});
