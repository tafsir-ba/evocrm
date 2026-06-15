import "server-only";

import { AppError } from "@/server/errors";

/**
 * Approved V1 permission keys — unknown keys must be rejected.
 */
export const PERMISSION_KEYS = [
  "dashboard:read",
  "project:create",
  "project:read",
  "project:update",
  "project:archive",
  "lead:create",
  "lead:read",
  "lead:update",
  "lead:archive",
  "property:create",
  "property:read",
  "property:update",
  "property:archive",
  "opportunity:create",
  "opportunity:read",
  "opportunity:update",
  "opportunity:archive",
  "activity:create",
  "activity:read",
  "activity:update",
  "activity:archive",
  "document:create",
  "document:read",
  "document:archive",
  "campaign:create",
  "campaign:read",
  "campaign:update",
  "campaign:archive",
  "campaign:delete",
  "settings:read",
  "settings:update",
  "users:manage",
  "roles:manage",
  "billing:manage",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

const PERMISSION_SET = new Set<string>(PERMISSION_KEYS);

export function isValidPermission(key: string): key is PermissionKey {
  return PERMISSION_SET.has(key);
}

export function validatePermissions(permissions: string[]): PermissionKey[] {
  const invalid = permissions.filter((key) => !isValidPermission(key));

  if (invalid.length > 0) {
    throw new AppError("VALIDATION_ERROR", "Invalid permission keys.", {
      details: { invalid },
    });
  }

  return permissions as PermissionKey[];
}

export function hasPermission(
  permissions: readonly string[],
  required: PermissionKey,
): boolean {
  return permissions.includes(required);
}
