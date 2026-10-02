/**
 * Vitest setup — mock server-only so server modules can be unit tested.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/server/repositories/project-grants", () => ({
  findProjectGrant: vi.fn(async () => null),
  findActiveProjectGrant: vi.fn(async () => null),
  findActiveProjectGrantsForUser: vi.fn(async () => []),
  findActiveProjectGrantsAcrossWorkspaces: vi.fn(async () => []),
  findActiveProjectGrantsForProject: vi.fn(async () => []),
  countActiveProjectAdmins: vi.fn(async () => 0),
  createProjectGrant: vi.fn(),
  updateProjectGrantRole: vi.fn(),
  revokeProjectGrant: vi.fn(),
  reactivateProjectGrant: vi.fn(),
}));

afterEach(() => {
  cleanup();
});
