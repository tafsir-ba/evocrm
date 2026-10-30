import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CHUNK_RELOAD_STORAGE_KEY,
  clearChunkReloadGuard,
  isChunkLoadError,
  isNextStaticAssetUrl,
  reloadOnceForChunkError,
} from "@/lib/chunk-load-error";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    getItem: (key: string) => (key in data ? data[key] : null),
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
    removeItem: (key: string) => {
      delete data[key];
    },
    data,
  };
}

describe("isChunkLoadError", () => {
  it("detects ChunkLoadError by name", () => {
    expect(
      isChunkLoadError({ name: "ChunkLoadError", message: "boom" }),
    ).toBe(true);
  });

  it("detects webpack loading-chunk messages", () => {
    expect(
      isChunkLoadError(
        new Error("Loading chunk 2730 failed.\n(error: https://crm.evo-home.ch/_next/static/chunks/2730.js)"),
      ),
    ).toBe(true);
  });

  it("detects dynamic import failures", () => {
    expect(
      isChunkLoadError(
        new Error("Failed to fetch dynamically imported module"),
      ),
    ).toBe(true);
  });

  it("ignores unrelated errors", () => {
    expect(isChunkLoadError(new Error("Cannot read properties of null"))).toBe(
      false,
    );
    expect(isChunkLoadError(null)).toBe(false);
  });
});

describe("isNextStaticAssetUrl", () => {
  it("matches Next static chunk URLs", () => {
    expect(
      isNextStaticAssetUrl(
        "https://crm.evo-home.ch/_next/static/chunks/2730-abc.js",
      ),
    ).toBe(true);
  });

  it("rejects unrelated URLs", () => {
    expect(isNextStaticAssetUrl("https://crm.evo-home.ch/login")).toBe(false);
    expect(isNextStaticAssetUrl(undefined)).toBe(false);
  });
});

describe("reloadOnceForChunkError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reloads once then blocks a second attempt", () => {
    const storage = memoryStorage();
    const reload = vi.fn();

    expect(reloadOnceForChunkError(storage, reload)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(storage.data[CHUNK_RELOAD_STORAGE_KEY]).toBe("1");

    expect(reloadOnceForChunkError(storage, reload)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("can recover again after the guard is cleared", () => {
    const storage = memoryStorage({ [CHUNK_RELOAD_STORAGE_KEY]: "1" });
    const reload = vi.fn();

    clearChunkReloadGuard(storage);
    expect(reloadOnceForChunkError(storage, reload)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("returns false when storage is unavailable", () => {
    expect(reloadOnceForChunkError(null, vi.fn())).toBe(false);
  });
});
