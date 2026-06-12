import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  parseRequestOrThrow,
  validateRequest,
  validateSearchParams,
} from "@/server/validation/request";

const testSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});

describe("request validation helpers", () => {
  it("returns typed success result", () => {
    const result = validateRequest(testSchema, {
      name: "Jane",
      email: "jane@example.com",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Jane");
    }
  });

  it("returns VALIDATION_ERROR details on failure", () => {
    const result = validateRequest(testSchema, {
      name: "",
      email: "not-an-email",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
      expect(result.error.details).toBeDefined();
    }
  });

  it("validates URL search params", () => {
    const params = new URLSearchParams({ page: "2", pageSize: "50" });
    const schema = z.object({
      page: z.coerce.number().int().positive(),
      pageSize: z.coerce.number().int().positive(),
    });

    const result = validateSearchParams(schema, params);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ page: 2, pageSize: 50 });
    }
  });

  it("throws AppError from parseRequestOrThrow", () => {
    expect(() => parseRequestOrThrow(testSchema, { name: "", email: "x" })).toThrow(
      /Invalid request/,
    );
  });
});
