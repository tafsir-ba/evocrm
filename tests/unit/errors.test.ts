import { describe, expect, it } from "vitest";

import {
  AppError,
  serializeAppError,
  serializeUnknownError,
  toAppError,
} from "@/server/errors";

describe("AppError", () => {
  it("maps error codes to HTTP status", () => {
    const error = new AppError("NOT_FOUND", "Resource not found.");
    expect(error.status).toBe(404);
    expect(error.code).toBe("NOT_FOUND");
  });

  it("serializes to stable API error shape", () => {
    const error = new AppError("CONFLICT", "Duplicate record.", {
      details: { slug: ["Already taken"] },
    });

    expect(serializeAppError(error)).toEqual({
      error: {
        code: "CONFLICT",
        message: "Duplicate record.",
        details: { slug: ["Already taken"] },
      },
    });
  });

  it("does not expose internal errors", () => {
    const internal = new AppError("INTERNAL_ERROR", "DB timeout", {
      expose: false,
    });
    expect(serializeUnknownError(internal)).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred.",
      },
    });
  });

  it("converts unknown errors to INTERNAL_ERROR", () => {
    const appError = toAppError(new Error("boom"));
    expect(appError.code).toBe("INTERNAL_ERROR");
    expect(appError.expose).toBe(false);
  });
});
