import { describe, expect, it, vi } from "vitest";

import {
  buildPropertyPhotoUploadWarning,
  filterPropertyImageDocuments,
  generatePastedImageFileName,
  isPropertyPhotoDocument,
  MAX_PROPERTY_PHOTO_BYTES,
  MAX_PROPERTY_PHOTO_QUEUE,
  normalizePropertyPhotoFile,
  PROPERTY_PHOTO_MIME_TYPES,
  resolvePropertyPhotoMimeType,
  sortPropertyPhotosByCreatedAt,
  validatePropertyPhotoClient,
} from "@/lib/property-media";
import type { DocumentListItem } from "@/lib/documents";

function sampleDocument(
  overrides: Partial<DocumentListItem> = {},
): DocumentListItem {
  return {
    id: "doc-1",
    fileName: "photo.jpg",
    mimeType: "image/jpeg",
    fileSize: 1024,
    visibility: "private",
    status: "active",
    createdAt: "2026-06-14T10:00:00.000Z",
    uploadedByUser: null,
    ...overrides,
  };
}

describe("property media helpers", () => {
  it("accepts allowed image mime types", () => {
    for (const mimeType of PROPERTY_PHOTO_MIME_TYPES) {
      expect(
        resolvePropertyPhotoMimeType({ fileName: "photo.bin", mimeType }),
      ).toBe(mimeType);
    }
  });

  it("rejects pdf, office, text, and unknown mime types", () => {
    expect(
      resolvePropertyPhotoMimeType({
        fileName: "file.pdf",
        mimeType: "application/pdf",
      }),
    ).toBeNull();
    expect(
      resolvePropertyPhotoMimeType({
        fileName: "file.docx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    ).toBeNull();
    expect(
      resolvePropertyPhotoMimeType({
        fileName: "notes.txt",
        mimeType: "text/plain",
      }),
    ).toBeNull();
    expect(
      resolvePropertyPhotoMimeType({
        fileName: "unknown.bin",
        mimeType: "application/octet-stream",
      }),
    ).toBeNull();
  });

  it("enforces max queue count constant", () => {
    expect(MAX_PROPERTY_PHOTO_QUEUE).toBe(20);
  });

  it("enforces max file size matching document limit", () => {
    const file = new File([new Uint8Array(MAX_PROPERTY_PHOTO_BYTES + 1)], "big.jpg", {
      type: "image/jpeg",
    });

    expect(validatePropertyPhotoClient(file)).toContain("or smaller");
  });

  it("generates fallback names for pasted images without useful names", () => {
    const first = generatePastedImageFileName("image/png");
    const second = generatePastedImageFileName("image/png");

    expect(first).toMatch(/^pasted-image-.+\.png$/);
    expect(second).not.toBe(first);
  });

  it("normalizes pasted clipboard images with empty names", () => {
    const file = new File([new Uint8Array([1, 2, 3])], "", { type: "image/png" });
    const normalized = normalizePropertyPhotoFile(file);

    expect(normalized.name).toMatch(/^pasted-image-.+\.png$/);
    expect(normalized.type).toBe("image/png");
  });

  it("filters active property image documents", () => {
    const documents = [
      sampleDocument(),
      sampleDocument({ id: "doc-2", mimeType: "application/pdf", fileName: "file.pdf" }),
      sampleDocument({ id: "doc-3", status: "archived" }),
      sampleDocument({ id: "doc-4", mimeType: "image/webp", fileName: "cover.webp" }),
    ];

    expect(filterPropertyImageDocuments(documents)).toHaveLength(2);
    expect(isPropertyPhotoDocument(documents[0])).toBe(true);
    expect(isPropertyPhotoDocument(documents[1])).toBe(false);
  });

  it("sorts property photos by createdAt ascending", () => {
    const documents = [
      sampleDocument({ id: "new", createdAt: "2026-06-15T10:00:00.000Z" }),
      sampleDocument({ id: "old", createdAt: "2026-06-14T10:00:00.000Z" }),
    ];

    const sorted = sortPropertyPhotosByCreatedAt(documents, "asc");
    expect(sorted.map((document) => document.id)).toEqual(["old", "new"]);
  });

  it("builds upload warning messages for failed uploads", () => {
    expect(
      buildPropertyPhotoUploadWarning([{ fileName: "a.jpg", success: true }]),
    ).toBeNull();

    expect(
      buildPropertyPhotoUploadWarning([
        { fileName: "a.jpg", success: false },
      ]),
    ).toContain("a.jpg");

    expect(
      buildPropertyPhotoUploadWarning([
        { fileName: "a.jpg", success: false },
        { fileName: "b.jpg", success: false },
      ]),
    ).toContain("2 photos");
  });

  it("paginates through all property image document pages", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            {
              id: "doc-1",
              fileName: "a.jpg",
              mimeType: "image/jpeg",
              fileSize: 100,
              visibility: "private",
              status: "active",
              createdAt: "2026-06-14T10:00:00.000Z",
              uploadedByUser: null,
            },
          ],
          pagination: { page: 1, pageSize: 100, total: 101, totalPages: 2 },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            {
              id: "doc-2",
              fileName: "b.jpg",
              mimeType: "image/jpeg",
              fileSize: 100,
              visibility: "private",
              status: "active",
              createdAt: "2026-06-15T10:00:00.000Z",
              uploadedByUser: null,
            },
          ],
          pagination: { page: 2, pageSize: 100, total: 101, totalPages: 2 },
        }),
      });

    vi.stubGlobal("fetch", fetchMock);

    const { fetchPropertyImageDocuments } = await import("@/lib/property-media");
    const documents = await fetchPropertyImageDocuments("demo", "507f1f77bcf86cd799439011");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(documents).toHaveLength(2);
    expect(documents[0]?.id).toBe("doc-1");
    expect(documents[1]?.id).toBe("doc-2");

    vi.unstubAllGlobals();
  });
});
