import { afterEach, describe, expect, it, vi } from "vitest";

import {
  coerceVisitMediaFile,
  describeStoragePutFailure,
  uploadVisitMedia,
  VisitMediaUploadError,
} from "@/lib/visit-notes-upload";
import {
  isVisitImageMimeType,
  isVisitVideoMimeType,
  resolveVisitMediaMimeType,
  validateVisitMediaFileClient,
} from "@/lib/visit-notes";
import { documentUploadUrlInputSchema } from "@/server/validation/documents";

describe("iPhone MIME resolution", () => {
  it("infers HEIC and MOV when File.type is empty", () => {
    expect(resolveVisitMediaMimeType({ name: "IMG_001.HEIC", type: "" })).toBe(
      "image/heic",
    );
    expect(resolveVisitMediaMimeType({ name: "clip.mov", type: "" })).toBe(
      "video/quicktime",
    );
    expect(isVisitImageMimeType("image/heic")).toBe(true);
    expect(isVisitVideoMimeType("video/quicktime")).toBe(true);
    expect(
      validateVisitMediaFileClient({
        name: "IMG_001.HEIC",
        type: "",
        size: 2048,
      } as File),
    ).toBeNull();
  });

  it("accepts HEIC and QuickTime on visit_session upload validation", () => {
    const heic = documentUploadUrlInputSchema.safeParse({
      linkedEntityType: "visit_session",
      linkedEntityId: "507f1f77bcf86cd799439011",
      fileName: "IMG_001.HEIC",
      mimeType: "image/heic",
      fileSize: 1024,
      visibility: "private",
    });
    expect(heic.success).toBe(true);

    const mov = documentUploadUrlInputSchema.safeParse({
      linkedEntityType: "visit_session",
      linkedEntityId: "507f1f77bcf86cd799439011",
      fileName: "tour.mov",
      mimeType: "video/quicktime",
      fileSize: 1024,
      visibility: "private",
    });
    expect(mov.success).toBe(true);

    const leadHeic = documentUploadUrlInputSchema.safeParse({
      linkedEntityType: "lead",
      linkedEntityId: "507f1f77bcf86cd799439011",
      fileName: "IMG_001.HEIC",
      mimeType: "image/heic",
      fileSize: 1024,
      visibility: "private",
    });
    expect(leadHeic.success).toBe(false);
  });
});

describe("describeStoragePutFailure", () => {
  it("maps Safari Load failed to an actionable CORS message", () => {
    expect(describeStoragePutFailure(new Error("Load failed"))).toMatch(/CORS/i);
    expect(describeStoragePutFailure(new Error("Failed to fetch"))).toMatch(/Retry/i);
  });
});

describe("coerceVisitMediaFile", () => {
  it("fills empty MIME from extension", () => {
    const raw = new File([new Uint8Array([1, 2, 3])], "note.m4a", { type: "" });
    const coerced = coerceVisitMediaFile(raw);
    expect(coerced.type).toBe("audio/mp4");
  });
});

describe("uploadVisitMedia same-origin direct path", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uploads via /documents/direct and returns document id", async () => {
    const xhrInstances: Array<{
      open: ReturnType<typeof vi.fn>;
      send: ReturnType<typeof vi.fn>;
      upload: { onprogress: ((event: ProgressEvent) => void) | null };
      onload: (() => void) | null;
      onerror: (() => void) | null;
      status: number;
      response: unknown;
    }> = [];

    class MockXHR {
      upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      ontimeout: (() => void) | null = null;
      status = 0;
      response: unknown = null;
      responseType = "";
      withCredentials = false;
      timeout = 0;
      open = vi.fn();
      send = vi.fn(() => {
        this.status = 201;
        this.response = {
          data: { document: { id: "507f1f77bcf86cd799439099" } },
        };
        this.upload.onprogress?.({
          lengthComputable: true,
          loaded: 50,
          total: 100,
        } as ProgressEvent);
        this.onload?.();
      });
      constructor() {
        xhrInstances.push(this);
      }
    }

    vi.stubGlobal("XMLHttpRequest", MockXHR as unknown as typeof XMLHttpRequest);

    const progress: number[] = [];
    const result = await uploadVisitMedia({
      workspaceSlug: "evo-home",
      sessionId: "507f1f77bcf86cd799439013",
      file: new File([new Uint8Array([1, 2, 3, 4])], "photo.jpg", {
        type: "image/jpeg",
      }),
      onProgress: (value) => progress.push(value),
    });

    expect(result.documentId).toBe("507f1f77bcf86cd799439099");
    expect(result.kind).toBe("photo");
    expect(xhrInstances[0]?.open).toHaveBeenCalledWith(
      "POST",
      "/api/workspaces/evo-home/documents/direct",
    );
    expect(progress.length).toBeGreaterThan(0);
  });

  it("surfaces actionable VisitMediaUploadError on API failure", async () => {
    class MockXHR {
      upload = { onprogress: null };
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      ontimeout: (() => void) | null = null;
      status = 0;
      response: unknown = null;
      responseType = "";
      withCredentials = false;
      timeout = 0;
      open = vi.fn();
      send = vi.fn(() => {
        this.status = 400;
        this.response = {
          error: { message: "Unsupported file type." },
        };
        this.onload?.();
      });
    }

    vi.stubGlobal("XMLHttpRequest", MockXHR as unknown as typeof XMLHttpRequest);

    await expect(
      uploadVisitMedia({
        workspaceSlug: "evo-home",
        sessionId: "507f1f77bcf86cd799439013",
        file: new File([new Uint8Array([1])], "photo.jpg", { type: "image/jpeg" }),
      }),
    ).rejects.toMatchObject({
      name: "VisitMediaUploadError",
      message: "Unsupported file type.",
      retryable: false,
    } satisfies Partial<VisitMediaUploadError>);
  });
});
