import { describe, expect, it } from "vitest";

import {
  preferredProjectStorageKey,
  readPreferredProjectId,
  readProjectIdFromPathname,
  resolveProjectsNavHref,
  writePreferredProjectId,
} from "@/lib/preferred-project";

describe("preferred project nav helpers", () => {
  it("resolves Projects nav to Leads when a project is preferred", () => {
    expect(
      resolveProjectsNavHref("acme", "507f1f77bcf86cd799439011"),
    ).toBe("/w/acme/projects/507f1f77bcf86cd799439011/leads");
    expect(resolveProjectsNavHref("acme", null)).toBe("/w/acme/projects");
  });

  it("reads project ids from project paths", () => {
    expect(
      readProjectIdFromPathname(
        "/w/acme/projects/507f1f77bcf86cd799439011/leads",
      ),
    ).toBe("507f1f77bcf86cd799439011");
    expect(readProjectIdFromPathname("/w/acme/projects")).toBeNull();
  });

  it("persists preferred project ids in storage", () => {
    const data: Record<string, string> = {};
    const storage = {
      getItem: (key: string) => data[key] ?? null,
      setItem: (key: string, value: string) => {
        data[key] = value;
      },
      removeItem: (key: string) => {
        delete data[key];
      },
    };

    writePreferredProjectId("acme", "507f1f77bcf86cd799439011", storage);
    expect(data[preferredProjectStorageKey("acme")]).toBe(
      "507f1f77bcf86cd799439011",
    );
    expect(readPreferredProjectId("acme", storage)).toBe(
      "507f1f77bcf86cd799439011",
    );
    writePreferredProjectId("acme", null, storage);
    expect(readPreferredProjectId("acme", storage)).toBeNull();
  });
});
