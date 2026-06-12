import "server-only";

import { z } from "zod";

import { AppError } from "@/server/errors";

export type ValidationSuccess<T> = {
  success: true;
  data: T;
};

export type ValidationFailure = {
  success: false;
  error: AppError;
};

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

function formatZodIssues(error: z.ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const path = issue.path.length > 0 ? issue.path.join(".") : "_root";
    const messages = details[path] ?? [];
    messages.push(issue.message);
    details[path] = messages;
  }

  return details;
}

export function validateRequest<TSchema extends z.ZodType>(
  schema: TSchema,
  input: unknown,
): ValidationResult<z.infer<TSchema>> {
  const result = schema.safeParse(input);

  if (!result.success) {
    return {
      success: false,
      error: new AppError("VALIDATION_ERROR", "Invalid request.", {
        details: formatZodIssues(result.error),
      }),
    };
  }

  return {
    success: true,
    data: result.data,
  };
}

export function validateSearchParams<TSchema extends z.ZodType>(
  schema: TSchema,
  searchParams: URLSearchParams,
): ValidationResult<z.infer<TSchema>> {
  const raw: Record<string, string | string[]> = {};

  for (const key of new Set(searchParams.keys())) {
    const values = searchParams.getAll(key);
    raw[key] = values.length === 1 ? values[0]! : values;
  }

  return validateRequest(schema, raw);
}

/**
 * Parse request body or throw VALIDATION_ERROR AppError.
 */
export function parseRequestOrThrow<TSchema extends z.ZodType>(
  schema: TSchema,
  input: unknown,
): z.infer<TSchema> {
  const result = validateRequest(schema, input);
  if (!result.success) {
    throw result.error;
  }
  return result.data;
}
