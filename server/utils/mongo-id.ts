import "server-only";

import mongoose from "mongoose";

/** Safely maps a stored ObjectId (or string) to a string id, or null when absent. */
export function toObjectIdString(value: unknown): string | null {
  if (value == null) {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "object" && "toString" in value) {
    const asString = (value as { toString(): string }).toString();
    return asString.length > 0 ? asString : null;
  }

  return null;
}

export function isValidObjectId(value: string | null | undefined): value is string {
  return Boolean(value && mongoose.isValidObjectId(value));
}
