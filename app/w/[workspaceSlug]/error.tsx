"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/ui/error-state";
import { PageContainer } from "@/components/layout/page-header";
import {
  clearChunkReloadGuard,
  isChunkLoadError,
  reloadOnceForChunkError,
} from "@/lib/chunk-load-error";

export default function WorkspaceSegmentError({
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
    <PageContainer>
      <ErrorState
        title={chunkFailure ? "Couldn’t load the app" : "Something went wrong"}
        description={
          chunkFailure
            ? "A required script failed to download. Refresh to try again."
            : error.message ||
              "This page failed to render. You can retry or navigate away."
        }
        primaryAction={{
          label: chunkFailure ? "Refresh" : "Retry",
          onClick: () => {
            if (chunkFailure) {
              clearChunkReloadGuard();
              window.location.reload();
              return;
            }
            reset();
          },
        }}
      />
    </PageContainer>
  );
}
