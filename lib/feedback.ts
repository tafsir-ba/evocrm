import {
  ALLOWED_FEEDBACK_IMAGE_TYPES,
  FEEDBACK_CATEGORIES,
  MAX_FEEDBACK_BODY_CHARS,
  MAX_FEEDBACK_SCREENSHOT_BYTES,
  MAX_FEEDBACK_SCREENSHOTS,
  type FeedbackCategory,
} from "@/server/feedback/constants";

export {
  ALLOWED_FEEDBACK_IMAGE_TYPES,
  FEEDBACK_CATEGORIES,
  MAX_FEEDBACK_BODY_CHARS,
  MAX_FEEDBACK_SCREENSHOT_BYTES,
  MAX_FEEDBACK_SCREENSHOTS,
  type FeedbackCategory,
};

export type FeedbackScreenshotDraft = {
  id: string;
  file: File;
  previewUrl: string;
};

const FEEDBACK_IMAGE_EXTENSION_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

export function resolveFeedbackImageMimeType(input: {
  fileName: string;
  mimeType: string;
}): (typeof ALLOWED_FEEDBACK_IMAGE_TYPES)[number] | null {
  if (
    ALLOWED_FEEDBACK_IMAGE_TYPES.includes(
      input.mimeType as (typeof ALLOWED_FEEDBACK_IMAGE_TYPES)[number],
    )
  ) {
    return input.mimeType as (typeof ALLOWED_FEEDBACK_IMAGE_TYPES)[number];
  }

  const extension = input.fileName.toLowerCase().match(/\.[a-z0-9]+$/)?.[0];
  if (!extension) {
    return null;
  }

  const fallbackMime = FEEDBACK_IMAGE_EXTENSION_MIME[extension];
  if (
    fallbackMime &&
    ALLOWED_FEEDBACK_IMAGE_TYPES.includes(
      fallbackMime as (typeof ALLOWED_FEEDBACK_IMAGE_TYPES)[number],
    )
  ) {
    return fallbackMime as (typeof ALLOWED_FEEDBACK_IMAGE_TYPES)[number];
  }

  return null;
}

export function formatFeedbackFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function validateFeedbackScreenshotClient(file: File): string | null {
  if (!resolveFeedbackImageMimeType({ fileName: file.name, mimeType: file.type })) {
    return "Only PNG, JPEG, and WEBP images are supported.";
  }

  if (file.size > MAX_FEEDBACK_SCREENSHOT_BYTES) {
    return `Image must be ${formatFeedbackFileSize(MAX_FEEDBACK_SCREENSHOT_BYTES)} or smaller.`;
  }

  return null;
}

export function isFeedbackScreenshotDuplicate(
  file: File,
  existing: FeedbackScreenshotDraft[],
): boolean {
  return existing.some(
    (item) =>
      item.file.name === file.name &&
      item.file.size === file.size &&
      item.file.lastModified === file.lastModified,
  );
}

export function parseFeedbackContextFromPathname(pathname: string): {
  projectId: string | null;
} {
  const segments = pathname.split("/").filter(Boolean);
  const projectsIndex = segments.indexOf("projects");

  if (projectsIndex >= 0 && segments[projectsIndex + 1]) {
    const candidate = segments[projectsIndex + 1];
    if (/^[a-f\d]{24}$/i.test(candidate)) {
      return { projectId: candidate };
    }
  }

  return { projectId: null };
}

export function getFeedbackCategoryLabel(category: FeedbackCategory): string {
  switch (category) {
    case "bug":
      return "Bug";
    case "idea":
      return "Idea";
    case "other":
      return "Other";
    default:
      return category;
  }
}
