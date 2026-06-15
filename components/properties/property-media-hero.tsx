"use client";

import { useCallback, useEffect, useState } from "react";

import type { DocumentListItem } from "@/lib/documents";
import { IconImage } from "@/lib/icons";
import {
  fetchDocumentSignedUrl,
  fetchPropertyHeroImageDocuments,
} from "@/lib/property-media";

type PropertyMediaHeroProps = {
  workspaceSlug: string;
  propertyId: string;
  canReadPhotos: boolean;
  canCreatePhoto: boolean;
  surfaceLabel: string;
  roomsLabel: string;
  reloadToken?: number;
  onUploadClick?: () => void;
};

export function PropertyMediaHero({
  workspaceSlug,
  propertyId,
  canReadPhotos,
  canCreatePhoto,
  surfaceLabel,
  roomsLabel,
  reloadToken = 0,
  onUploadClick,
}: PropertyMediaHeroProps) {
  const [photos, setPhotos] = useState<DocumentListItem[]>([]);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const loadHeroPhotos = useCallback(async () => {
    if (!canReadPhotos) {
      setPhotos([]);
      setPreviewUrls({});
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const heroPhotos = await fetchPropertyHeroImageDocuments(workspaceSlug, propertyId);
      setPhotos(heroPhotos);

      const urlEntries = await Promise.all(
        heroPhotos.map(async (document) => {
          try {
            const url = await fetchDocumentSignedUrl(workspaceSlug, document.id);
            return [document.id, url] as const;
          } catch {
            return [document.id, ""] as const;
          }
        }),
      );

      setPreviewUrls(Object.fromEntries(urlEntries.filter(([, url]) => url)));
    } catch {
      setPhotos([]);
      setPreviewUrls({});
    } finally {
      setLoading(false);
    }
  }, [canReadPhotos, propertyId, workspaceSlug]);

  useEffect(() => {
    void loadHeroPhotos();
  }, [loadHeroPhotos, reloadToken]);

  const heroPhoto = photos[0];
  const thumbnailPhotos = photos.slice(1, 4);

  return (
    <div className="flex flex-col md:flex-row gap-3 mb-4 md:h-[280px]">
      <div className="md:flex-[2] aspect-[16/9] md:aspect-auto md:h-full rounded-xl overflow-hidden bg-[var(--color-muted)] relative">
        {heroPhoto && previewUrls[heroPhoto.id] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrls[heroPhoto.id]}
            alt={heroPhoto.fileName}
            className="h-full w-full object-cover"
          />
        ) : heroPhoto ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-[var(--color-ink-faint)]">
            <IconImage size={32} />
            <p className="text-[12px] text-[var(--color-ink-muted)]">Preview unavailable</p>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-[var(--color-ink-faint)]">
            <IconImage size={32} />
            {!loading && canCreatePhoto && onUploadClick && (
              <button
                type="button"
                className="rounded-md border border-[var(--color-line)] bg-white px-3 py-1.5 text-[12px] font-medium text-[var(--color-ink)] hover:border-[var(--color-brand-600)] focus-ring"
                onClick={onUploadClick}
              >
                Upload photos
              </button>
            )}
          </div>
        )}
        <span className="absolute bottom-3 left-3 px-2 py-1 rounded-md bg-[#0f172a]/60 text-white text-[11.5px] font-medium backdrop-blur-sm">
          {surfaceLabel} · {roomsLabel}
        </span>
      </div>
      <div className="md:flex-1 md:h-full grid grid-cols-3 md:grid-cols-1 md:grid-rows-3 gap-3">
        {[0, 1, 2].map((index) => {
          const photo = thumbnailPhotos[index];
          const previewUrl = photo ? previewUrls[photo.id] : undefined;

          return (
            <div
              key={index}
              className="aspect-[16/10] md:aspect-auto md:h-full rounded-lg overflow-hidden bg-[var(--color-muted)] flex items-center justify-center text-[var(--color-ink-faint)]"
            >
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt={photo?.fileName ?? ""} className="h-full w-full object-cover" />
              ) : (
                <IconImage size={20} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
