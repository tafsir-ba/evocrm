"use client";

import { useEffect } from "react";

import {
  clearChunkReloadGuard,
  isChunkLoadError,
  reloadOnceForChunkError,
} from "@/lib/chunk-load-error";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const chunkFailure = isChunkLoadError(error);

  useEffect(() => {
    console.error(error);

    if (!chunkFailure) return;

    const reloaded = reloadOnceForChunkError();
    if (!reloaded) {
      // Already tried a hard reload this tab — allow a later visit to retry.
      clearChunkReloadGuard();
    }
  }, [chunkFailure, error]);

  function handleRetry() {
    clearChunkReloadGuard();
    reset();
    window.location.reload();
  }

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          background: "#fff",
          color: "#0f172a",
        }}
      >
        <div style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h1
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            {chunkFailure ? "Couldn’t load the app" : "Something went wrong"}
          </h1>
          <p
            style={{
              margin: "10px 0 0",
              fontSize: 14,
              lineHeight: 1.5,
              color: "#64748b",
            }}
          >
            {chunkFailure
              ? "A required script failed to download. Refresh to try again."
              : error.message || "An unexpected error occurred."}
          </p>
          <button
            type="button"
            onClick={handleRetry}
            style={{
              marginTop: 20,
              height: 40,
              padding: "0 16px",
              border: 0,
              borderRadius: 8,
              background: "#2563eb",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Refresh
          </button>
        </div>
      </body>
    </html>
  );
}
