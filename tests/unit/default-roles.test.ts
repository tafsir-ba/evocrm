import { describe, expect, it } from "vitest";

import {
  DEFAULT_ROLE_DEFINITIONS,
  getDefaultRolePermissions,
} from "@/server/permissions/roles";

describe("default role permission sets", () => {
  it("seeds four system roles", () => {
    expect(DEFAULT_ROLE_DEFINITIONS.map((role) => role.key)).toEqual([
      "owner",
      "admin",
      "agent",
      "viewer",
    ]);
  });

  it("gives owner full permissions", () => {
    const ownerPermissions = getDefaultRolePermissions("owner");
    expect(ownerPermissions).toContain("billing:manage");
    expect(ownerPermissions).toContain("roles:manage");
  });

  it("gives admin same operational permissions as owner for V1", () => {
    const adminPermissions = getDefaultRolePermissions("admin");
    expect(adminPermissions).toContain("roles:manage");
    expect(adminPermissions).toContain("billing:manage");
    expect(adminPermissions).toContain("users:manage");
  });

  it("gives agent operational read/write without archive/manage", () => {
    const agentPermissions = getDefaultRolePermissions("agent");
    expect(agentPermissions).toContain("lead:update");
    expect(agentPermissions).not.toContain("lead:archive");
    expect(agentPermissions).not.toContain("users:manage");
  });

  it("gives viewer read-only permissions", () => {
    const viewerPermissions = getDefaultRolePermissions("viewer");
    expect(viewerPermissions).toContain("lead:read");
    expect(viewerPermissions).not.toContain("lead:create");
    expect(viewerPermissions).not.toContain("settings:update");
  });
});
