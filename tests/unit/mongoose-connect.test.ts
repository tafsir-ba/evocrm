import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("mongoose", () => ({
  default: {
    connect: vi.fn(() => Promise.resolve({})),
    disconnect: vi.fn(() => Promise.resolve(undefined)),
  },
}));

vi.mock("@/server/env", () => ({
  getEnv: vi.fn(() => ({
    NODE_ENV: "production",
    MONGODB_URI: "mongodb://localhost:27017/evocrm",
    NEXT_PUBLIC_APP_URL: "https://crm.evo-home.ch",
  })),
}));

import mongoose from "mongoose";
import { connectDb, disconnectDbForTests } from "@/server/db/mongoose";

describe("connectDb", () => {
  afterEach(async () => {
    await disconnectDbForTests();
    vi.clearAllMocks();
  });

  it("connects without requiring optional production feature env vars", async () => {
    await expect(connectDb()).resolves.toBeDefined();
    expect(mongoose.connect).toHaveBeenCalledWith(
      "mongodb://localhost:27017/evocrm",
      { bufferCommands: false },
    );
  });
});
