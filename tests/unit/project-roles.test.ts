import { describe, expect, it } from "vitest";

import {
  getProjectRolePermissions,
  isProjectRoleKey,
  resolveEffectiveProjectPermissions,
  PROJECT_ROLE_DEFINITIONS,
} from "@/server/permissions/project-roles";

describe("project role definitions", () => {
  it("defines exactly three project roles", () => {
    expect(PROJECT_ROLE_DEFINITIONS).toHaveLength(3);
    expect(PROJECT_ROLE_DEFINITIONS.map((r) => r.key)).toEqual([
      "project_admin",
      "contributor",
      "viewer",
    ]);
  });

  it("validates project role keys", () => {
    expect(isProjectRoleKey("project_admin")).toBe(true);
    expect(isProjectRoleKey("contributor")).toBe(true);
    expect(isProjectRoleKey("viewer")).toBe(true);
    expect(isProjectRoleKey("owner")).toBe(false);
    expect(isProjectRoleKey("admin")).toBe(false);
  });

  it("viewer has only read permissions", () => {
    const permissions = getProjectRolePermissions("viewer");
    const writePermissions = permissions.filter(
      (p) => p.includes("create") || p.includes("update") || p.includes("archive") || p.includes("delete"),
    );
    expect(writePermissions).toEqual([]);
  });

  it("contributor cannot manage users or settings", () => {
    const permissions = getProjectRolePermissions("contributor");
    expect(permissions).not.toContain("users:manage");
    expect(permissions).not.toContain("settings:update");
    expect(permissions).not.toContain("billing:manage");
    expect(permissions).not.toContain("roles:manage");
  });

  it("project admin cannot manage workspace billing/roles/users", () => {
    const permissions = getProjectRolePermissions("project_admin");
    expect(permissions).not.toContain("billing:manage");
    expect(permissions).not.toContain("roles:manage");
    expect(permissions).not.toContain("users:manage");
  });
});

describe("resolveEffectiveProjectPermissions", () => {
  it("intersects workspace permissions with project role permissions", () => {
    const workspacePermissions = ["lead:read", "lead:create", "billing:manage"];
    const effective = resolveEffectiveProjectPermissions(workspacePermissions, "viewer");
    expect(effective).toContain("lead:read");
    expect(effective).not.toContain("lead:create");
    expect(effective).not.toContain("billing:manage");
  });

  it("project role cannot expand workspace permissions", () => {
    const workspacePermissions = ["dashboard:read"];
    const effective = resolveEffectiveProjectPermissions(workspacePermissions, "project_admin");
    expect(effective).toEqual(["dashboard:read"]);
  });
});
