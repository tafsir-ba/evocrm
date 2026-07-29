import { describe, expect, it } from "vitest";

import { objectIdSchema } from "@/server/validation/common";
import { parseRequestOrThrow } from "@/server/validation/request";
import { AppError } from "@/server/errors";

describe("notification id validation", () => {
  it("accepts a 24-char hex object id", () => {
    expect(parseRequestOrThrow(objectIdSchema, "6a2f090c44d6c01e42138e49")).toBe(
      "6a2f090c44d6c01e42138e49",
    );
  });

  it("rejects invalid notification ids before mongoose", () => {
    expect(() => parseRequestOrThrow(objectIdSchema, "not-an-id")).toThrow(AppError);
    try {
      parseRequestOrThrow(objectIdSchema, "not-an-id");
    } catch (error) {
      expect(error).toMatchObject({ code: "VALIDATION_ERROR" });
    }
  });
});
