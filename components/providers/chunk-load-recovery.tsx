"use client";

import { useEffect } from "react";

import { clearChunkReloadGuard } from "@/lib/chunk-load-error";

/**
 * After a healthy mount, drop the one-shot reload guard so a later
 * transient chunk failure (e.g. Cloudflare 521) can auto-recover again.
 */
export function ChunkLoadRecovery({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      clearChunkReloadGuard();
    }, 2500);
    return () => window.clearTimeout(timer);
  }, []);

  return children;
}
