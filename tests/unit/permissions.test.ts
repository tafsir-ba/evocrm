import { describe, expect, it } from "vitest";

import { AppError } from "@/server/errors";
import {
  hasPermission,
  isValidPermission,
  validatePermissions,
} from "@/server/permissions/permissions";

describe("permission allowlist", () => {
  it("accepts approved permission keys", () => {
    expect(isValidPermission("dashboard:read")).toBe(true);
    expect(isValidPermission("lead:update")).toBe(true);
  });

  it("rejects unknown permission keys", () => {
    expect(isValidPermission("admin:all")).toBe(false);
    expect(() => validatePermissions(["dashboard:read", "fake:perm"])).toThrow(
      AppError,
    );
  });

  it("checks membership permission inclusion", () => {
    expect(hasPermission(["dashboard:read", "lead:read"], "lead:read")).toBe(
      true,
    );
    expect(hasPermission(["dashboard:read"], "settings:update")).toBe(false);
  });
});
