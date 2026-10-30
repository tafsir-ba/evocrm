import {
  isChunkLoadError,
  isNextStaticAssetUrl,
  reloadOnceForChunkError,
} from "@/lib/chunk-load-error";

function handleChunkFailure(error: unknown, messageFallback = ""): void {
  if (!isChunkLoadError(error, messageFallback)) return;
  reloadOnceForChunkError();
}

if (typeof window !== "undefined") {
  window.addEventListener(
    "error",
    (event) => {
      const target = event.target;
      if (
        target instanceof HTMLScriptElement &&
        isNextStaticAssetUrl(target.src)
      ) {
        reloadOnceForChunkError();
        return;
      }
      handleChunkFailure(event.error, event.message);
    },
    true,
  );

  window.addEventListener("unhandledrejection", (event) => {
    handleChunkFailure(event.reason);
  });
}
