"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { IconMore } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { fetchDocumentSignedUrl } from "@/lib/visit-notes-upload";

type MediaKind = "photo" | "video" | "audio";

export function useVisitSignedUrl(
  workspaceSlug: string,
  documentId: string | null,
): {
  url: string | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
} {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(documentId));
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!documentId) {
      setUrl(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchDocumentSignedUrl(workspaceSlug, documentId)
      .then((next) => {
        if (!cancelled) {
          setUrl(next);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setUrl(null);
          setError(err instanceof Error ? err.message : "Could not load media.");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug, documentId, tick]);

  return {
    url,
    error,
    loading,
    reload: () => setTick((value) => value + 1),
  };
}

export function VisitMediaMessage({
  workspaceSlug,
  kind,
  documentId,
  transcript,
  localPreviewUrl,
  onOpenLightbox,
}: {
  workspaceSlug: string;
  kind: MediaKind;
  documentId: string | null;
  transcript?: string | null;
  localPreviewUrl?: string | null;
  onOpenLightbox?: (url: string, kind: MediaKind) => void;
}) {
  const { url, error, loading, reload } = useVisitSignedUrl(workspaceSlug, documentId);
  const [menuOpen, setMenuOpen] = useState(false);
  const displayUrl = url ?? localPreviewUrl ?? null;

  return (
    <div className="w-full max-w-full space-y-2 overflow-hidden" data-testid={`visit-media-${kind}`}>
      {kind === "photo" && (
        <button
          type="button"
          className="block w-full max-w-full overflow-hidden rounded-2xl bg-[var(--color-muted)] touch-manipulation"
          onClick={() => {
            if (displayUrl) onOpenLightbox?.(displayUrl, "photo");
          }}
          disabled={!displayUrl}
        >
          {displayUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={displayUrl}
              alt=""
              className="max-h-64 w-full object-cover"
            />
          ) : (
            <div className="flex h-40 w-full items-center justify-center text-[12px] text-[var(--color-ink-muted)]">
              {loading ? "Loading…" : "Photo"}
            </div>
          )}
        </button>
      )}

      {kind === "video" && (
        <div className="w-full max-w-full overflow-hidden rounded-2xl bg-black">
          {displayUrl ? (
            <video
              src={displayUrl}
              controls
              playsInline
              preload="metadata"
              className="max-h-72 w-full"
            />
          ) : (
            <div className="flex h-40 w-full items-center justify-center text-[12px] text-white/80">
              {loading ? "Loading…" : "Video"}
            </div>
          )}
        </div>
      )}

      {kind === "audio" && (
        <div className="w-full max-w-full rounded-2xl border border-[var(--color-line)] bg-white px-3 py-2.5">
          {displayUrl ? (
            <audio src={displayUrl} controls preload="metadata" className="w-full max-w-full" />
          ) : (
            <p className="text-[12px] text-[var(--color-ink-muted)]">
              {loading ? "Loading audio…" : "Audio"}
            </p>
          )}
          {transcript?.trim() ? (
            <p className="mt-2 whitespace-pre-wrap break-words text-[14px] leading-relaxed text-[var(--color-ink)]">
              {transcript}
            </p>
          ) : null}
        </div>
      )}

      {error && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[12px] text-[var(--color-danger-fg)]">{error}</p>
          <Button size="sm" variant="secondary" type="button" onClick={reload}>
            Retry
          </Button>
        </div>
      )}

      {url && (
        <div className="relative">
          <button
            type="button"
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-ink-faint)] hover:bg-[var(--color-muted)]",
              menuOpen && "bg-[var(--color-muted)]",
            )}
            aria-label="Media actions"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <IconMore className="h-4 w-4" />
          </button>
          {menuOpen && (
            <div className="absolute left-0 top-8 z-10 min-w-[10rem] overflow-hidden rounded-xl border border-[var(--color-line)] bg-white shadow-[var(--shadow-md)]">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="block px-3 py-2 text-[13px] hover:bg-[var(--color-muted)]"
                onClick={() => setMenuOpen(false)}
              >
                Open / download
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
