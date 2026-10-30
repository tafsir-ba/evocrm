/**
 * Helpers for recovering from Next.js ChunkLoadError.
 *
 * Typical causes in production (Cloudflare + App Platform):
 * - Transient origin 521/5xx while fetching `/_next/static/chunks/*`
 * - Stale HTML after a deploy referencing replaced chunk hashes
 *
 * A single hard reload usually fixes both. Session-storage guards prevent loops.
 */

export const CHUNK_RELOAD_STORAGE_KEY = "evocrm:chunk-load-reload";

const CHUNK_ERROR_PATTERN =
  /Loading chunk [\w/-]+ failed|ChunkLoadError|Failed to fetch dynamically imported module|error loading dynamically imported module/i;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function defaultSessionStorage(): StorageLike | null {
  if (typeof sessionStorage === "undefined") return null;
  return sessionStorage;
}

export function isChunkLoadError(
  error: unknown,
  messageFallback = "",
): boolean {
  if (!error && !messageFallback) return false;

  if (typeof error === "string") {
    return CHUNK_ERROR_PATTERN.test(error);
  }

  if (error && typeof error === "object") {
    const name = "name" in error ? String(error.name ?? "") : "";
    const message =
      "message" in error ? String(error.message ?? "") : messageFallback;
    if (name === "ChunkLoadError") return true;
    if (CHUNK_ERROR_PATTERN.test(message)) return true;
  }

  return CHUNK_ERROR_PATTERN.test(messageFallback);
}

export function isNextStaticAssetUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url, "https://example.invalid");
    return parsed.pathname.includes("/_next/static/");
  } catch {
    return url.includes("/_next/static/");
  }
}

/**
 * Returns true when a reload was triggered. Returns false when a reload
 * already happened this tab session, or when storage is unavailable.
 */
export function reloadOnceForChunkError(
  storage: StorageLike | null = defaultSessionStorage(),
  reload: () => void = () => {
    window.location.reload();
  },
): boolean {
  if (!storage) return false;

  try {
    if (storage.getItem(CHUNK_RELOAD_STORAGE_KEY)) {
      return false;
    }
    storage.setItem(CHUNK_RELOAD_STORAGE_KEY, "1");
  } catch {
    return false;
  }

  reload();
  return true;
}

/** Clear the reload guard so a later transient failure can auto-recover. */
export function clearChunkReloadGuard(
  storage: Pick<Storage, "removeItem"> | null = defaultSessionStorage(),
): void {
  if (!storage) return;
  try {
    storage.removeItem(CHUNK_RELOAD_STORAGE_KEY);
  } catch {
    // ignore
  }
}
