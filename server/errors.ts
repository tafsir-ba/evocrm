import "server-only";

/**
 * Typed application errors and safe serialization for API responses.
 * See /docs/api-contracts.md for error shape and codes.
 */

export const ERROR_CODES = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION_ERROR",
  "CONFLICT",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
  "WORKSPACE_NOT_FOUND",
  "MEMBERSHIP_REQUIRED",
  "PERMISSION_DENIED",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

const ERROR_STATUS_MAP: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  WORKSPACE_NOT_FOUND: 404,
  MEMBERSHIP_REQUIRED: 403,
  PERMISSION_DENIED: 403,
};

export type ErrorDetails = Record<string, unknown>;

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: ErrorDetails;
  readonly expose: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    options?: {
      details?: ErrorDetails;
      expose?: boolean;
      cause?: unknown;
    },
  ) {
    super(message, { cause: options?.cause });
    this.name = "AppError";
    this.code = code;
    this.status = ERROR_STATUS_MAP[code];
    this.details = options?.details;
    this.expose = options?.expose ?? true;
  }
}

export type SerializedError = {
  error: {
    code: ErrorCode;
    message: string;
    details?: ErrorDetails;
  };
};

export function getHttpStatusForErrorCode(code: ErrorCode): number {
  return ERROR_STATUS_MAP[code];
}

export function serializeAppError(error: AppError): SerializedError {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details !== undefined ? { details: error.details } : {}),
    },
  };
}

export function serializeUnknownError(error: unknown): SerializedError {
  if (error instanceof AppError) {
    if (!error.expose) {
      return {
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred.",
        },
      };
    }
    return serializeAppError(error);
  }

  return {
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred.",
    },
  };
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  return new AppError("INTERNAL_ERROR", "An unexpected error occurred.", {
    expose: false,
    cause: error,
  });
}
