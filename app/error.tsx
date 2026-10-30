"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/ui/error-state";
import {
  clearChunkReloadGuard,
  isChunkLoadError,
  reloadOnceForChunkError,
} from "@/lib/chunk-load-error";

export default function RootSegmentError({
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
      clearChunkReloadGuard();
    }
  }, [chunkFailure, error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <ErrorState
          title={chunkFailure ? "Couldn’t load the app" : "Something went wrong"}
          description={
            chunkFailure
              ? "A required script failed to download. Refresh to try again."
              : error.message ||
                "This page failed to render. You can retry or navigate away."
          }
          primaryAction={{
            label: "Refresh",
            onClick: () => {
              clearChunkReloadGuard();
              reset();
              window.location.reload();
            },
          }}
        />
      </div>
    </div>
  );
}
