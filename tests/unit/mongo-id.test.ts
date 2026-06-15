import { describe, expect, it } from "vitest";

import { toObjectIdString } from "@/server/utils/mongo-id";

describe("toObjectIdString", () => {
  it("returns null for missing values", () => {
    expect(toObjectIdString(null)).toBeNull();
    expect(toObjectIdString(undefined)).toBeNull();
  });

  it("maps object ids to strings", () => {
    expect(toObjectIdString("507f1f77bcf86cd799439011")).toBe("507f1f77bcf86cd799439011");
  });
});
