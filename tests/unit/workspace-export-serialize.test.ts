import mongoose from "mongoose";
import { describe, expect, it } from "vitest";

import { serializeExportValue } from "@/server/services/workspace-export-sanitize";

describe("workspace export serialization", () => {
  it("stringifies nested ObjectIds and dates for JSON export", () => {
    const statusId = new mongoose.Types.ObjectId();
    const createdAt = new Date("2026-06-14T12:00:00.000Z");

    const serialized = serializeExportValue({
      id: "lead-1",
      statusId,
      tags: [statusId],
      createdAt,
    }) as Record<string, unknown>;

    expect(serialized.statusId).toBe(statusId.toString());
    expect(serialized.tags).toEqual([statusId.toString()]);
    expect(serialized.createdAt).toBe("2026-06-14T12:00:00.000Z");
  });
});
