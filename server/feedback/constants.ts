export const MAX_FEEDBACK_BODY_CHARS = 4000;
export const MAX_FEEDBACK_SCREENSHOTS = 5;
export const MAX_FEEDBACK_SCREENSHOT_BYTES = 10 * 1024 * 1024;
/** Max multipart body before parsing (5 × 10 MB screenshots + 5 MB form overhead). */
export const MAX_FEEDBACK_REQUEST_BYTES =
  MAX_FEEDBACK_SCREENSHOTS * MAX_FEEDBACK_SCREENSHOT_BYTES + 5 * 1024 * 1024;
export const ALLOWED_FEEDBACK_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;
export const FEEDBACK_RATE_LIMIT = {
  maxRequests: 10,
  windowMs: 60 * 60 * 1000,
} as const;
export const FEEDBACK_DEFAULT_LIST_LIMIT = 200;
export const FEEDBACK_MAX_LIST_LIMIT = 200;
export const FEEDBACK_CATEGORIES = ["bug", "idea", "other"] as const;
export const FEEDBACK_STATUSES = ["open", "resolved"] as const;
export const MAX_FEEDBACK_PAGE_URL_CHARS = 2048;
export const MAX_FEEDBACK_USER_AGENT_CHARS = 512;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];
