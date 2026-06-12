import { describe, expect, it } from "vitest";

import { AppError } from "@/server/errors";
import {
  appErrorResponse,
  buildPaginationMeta,
  errorResponse,
  handleRouteError,
  paginatedResponse,
  successResponse,
} from "@/server/api/responses";

describe("API response helpers", () => {
  it("returns success response shape", async () => {
    const response = successResponse({ id: "1", name: "Test" });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      data: { id: "1", name: "Test" },
    });
  });

  it("returns paginated response shape", async () => {
    const pagination = buildPaginationMeta(1, 25, 100);
    const response = paginatedResponse([{ id: "1" }, { id: "2" }], pagination);
    const body = await response.json();

    expect(body).toEqual({
      data: [{ id: "1" }, { id: "2" }],
      pagination: {
        page: 1,
        pageSize: 25,
        total: 100,
        totalPages: 4,
      },
    });
  });

  it("returns error response shape", async () => {
    const response = errorResponse("VALIDATION_ERROR", "Invalid request.", {
      details: { email: ["Invalid email"] },
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request.",
        details: { email: ["Invalid email"] },
      },
    });
  });

  it("maps error codes to HTTP status", async () => {
    const unauthenticated = await errorResponse(
      "UNAUTHENTICATED",
      "Authentication required.",
    );
    expect(unauthenticated.status).toBe(401);

    const permissionDenied = await errorResponse(
      "PERMISSION_DENIED",
      "Permission denied.",
    );
    expect(permissionDenied.status).toBe(403);

    const workspaceNotFound = await errorResponse(
      "WORKSPACE_NOT_FOUND",
      "Workspace not found.",
    );
    expect(workspaceNotFound.status).toBe(404);
  });

  it("masks non-exposed AppError in appErrorResponse", async () => {
    const error = new AppError("INTERNAL_ERROR", "Database connection failed.", {
      expose: false,
    });
    const response = appErrorResponse(error);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred.",
      },
    });
  });

  it("masks non-exposed AppError in handleRouteError", async () => {
    const error = new AppError("INTERNAL_ERROR", "Auth is not implemented yet.", {
      expose: false,
    });
    const response = handleRouteError(error);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.message).toBe("An unexpected error occurred.");
    expect(body.error.message).not.toContain("Auth is not implemented yet.");
  });
});
