import "server-only";

import { NextResponse } from "next/server";

import {
  AppError,
  getHttpStatusForErrorCode,
  serializeAppError,
  serializeUnknownError,
  type ErrorCode,
  type ErrorDetails,
} from "@/server/errors";
import { captureError } from "@/server/observability/capture-error";

export type PaginationMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type SuccessResponse<T> = {
  data: T;
};

export type PaginatedResponse<T> = {
  data: T[];
  pagination: PaginationMeta;
};

export type ErrorResponseBody = {
  error: {
    code: ErrorCode;
    message: string;
    details?: ErrorDetails;
  };
};

export function buildPaginationMeta(
  page: number,
  pageSize: number,
  total: number,
): PaginationMeta {
  return {
    page,
    pageSize,
    total,
    totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
  };
}

export function successResponse<T>(
  data: T,
  init?: ResponseInit,
): NextResponse<SuccessResponse<T>> {
  return NextResponse.json({ data }, init);
}

export function paginatedResponse<T>(
  data: T[],
  pagination: PaginationMeta,
  init?: ResponseInit,
): NextResponse<PaginatedResponse<T>> {
  return NextResponse.json({ data, pagination }, init);
}

export function errorResponse(
  code: ErrorCode,
  message: string,
  options?: {
    details?: ErrorDetails;
    status?: number;
  },
): NextResponse<ErrorResponseBody> {
  const body: ErrorResponseBody = {
    error: {
      code,
      message,
      ...(options?.details !== undefined ? { details: options.details } : {}),
    },
  };

  const status = options?.status ?? getHttpStatusForErrorCode(code);

  return NextResponse.json(body, { status });
}

function serializeAppErrorForApi(error: AppError): ErrorResponseBody {
  return error.expose ? serializeAppError(error) : serializeUnknownError(error);
}

function httpStatusForAppError(error: AppError): number {
  return error.expose ? error.status : 500;
}

export function appErrorResponse(
  error: AppError,
): NextResponse<ErrorResponseBody> {
  return NextResponse.json(serializeAppErrorForApi(error), {
    status: httpStatusForAppError(error),
  });
}

export function handleRouteError(error: unknown): NextResponse<ErrorResponseBody> {
  if (error instanceof AppError) {
    if (!error.expose) {
      captureError(error, { code: error.code });
    }

    return NextResponse.json(serializeAppErrorForApi(error), {
      status: httpStatusForAppError(error),
    });
  }

  captureError(error, { code: "INTERNAL_ERROR" });

  const serialized = serializeUnknownError(error);
  return NextResponse.json(serialized, { status: 500 });
}
