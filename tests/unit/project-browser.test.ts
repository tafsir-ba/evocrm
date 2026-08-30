import { describe, expect, it } from "vitest";

import {
  canPaginateProjectsInDatabase,
  compareProjectsForBrowser,
  matchesProjectBrowserView,
  nextProjectBrowserSort,
  paginateProjectBrowser,
} from "@/lib/project-browser";

const now = new Date(2026, 7, 30, 12, 0, 0);

const active = {
  id: "active",
  name: "Grosvenor Vistas",
  archivedAt: null,
  counts: { leads: 4, lastGenuineInboundAt: "2026-08-28T12:00:00.000Z" },
};
const stale = {
  id: "stale",
  name: "Parc des Crêts",
  archivedAt: null,
  counts: { leads: 8, lastGenuineInboundAt: "2026-06-01T12:00:00.000Z" },
};
const unknown = {
  id: "unknown",
  name: "Bulk import",
  archivedAt: null,
  counts: { leads: 20, lastGenuineInboundAt: null },
};
const archived = {
  id: "archived",
  name: "Old site",
  archivedAt: "2026-01-01T00:00:00.000Z",
  counts: { leads: 1, lastGenuineInboundAt: "2026-08-29T12:00:00.000Z" },
};

describe("project browser views and sort", () => {
  it("maps operational views to inbound-demand semantics without inventing statuses", () => {
    expect(matchesProjectBrowserView(active, "active", now)).toBe(true);
    expect(matchesProjectBrowserView(stale, "stale", now)).toBe(true);
    expect(matchesProjectBrowserView(unknown, "needs_attention", now)).toBe(true);
    expect(matchesProjectBrowserView(stale, "needs_attention", now)).toBe(true);
    expect(matchesProjectBrowserView(active, "needs_attention", now)).toBe(false);
    expect(matchesProjectBrowserView(archived, "all", now)).toBe(false);
    expect(matchesProjectBrowserView(archived, "archived", now)).toBe(true);
  });

  it("defaults to latest genuine inbound and keeps unknown dates from looking newest", () => {
    const page = paginateProjectBrowser([unknown, active, stale, archived], {
      view: "all",
      sort: "inbound",
      sortDir: "desc",
      page: 1,
      pageSize: 25,
      now,
    });

    expect(page.total).toBe(3);
    expect(page.projects.map((project) => project.id)).toEqual(["active", "stale", "unknown"]);
  });

  it("paginates after view and sort so a large portfolio stays a page at a time", () => {
    const many = Array.from({ length: 40 }, (_, index) => ({
      id: `p${index}`,
      name: `Site ${String(index).padStart(2, "0")}`,
      archivedAt: null,
      counts: { leads: index, lastGenuineInboundAt: null },
    }));

    const page = paginateProjectBrowser(many, {
      view: "all",
      sort: "name",
      sortDir: "asc",
      page: 2,
      pageSize: 25,
      now,
    });

    expect(page.total).toBe(40);
    expect(page.projects).toHaveLength(15);
    expect(page.projects[0]?.name).toBe("Site 25");
  });

  it("sorts status as Stale, Unknown, then Active", () => {
    const ranked = [active, unknown, stale].sort((left, right) =>
      compareProjectsForBrowser(left, right, "status", "asc", now),
    );
    expect(ranked.map((project) => project.id)).toEqual(["stale", "unknown", "active"]);
  });

  it("uses database pagination only for name lists without counts", () => {
    expect(
      canPaginateProjectsInDatabase({ view: "all", sort: "name", withCounts: false }),
    ).toBe(true);
    expect(
      canPaginateProjectsInDatabase({ view: "active", sort: "name", withCounts: false }),
    ).toBe(false);
    expect(
      canPaginateProjectsInDatabase({ view: "all", sort: "inbound", withCounts: true }),
    ).toBe(false);
  });

  it("toggles sort direction on the same column", () => {
    expect(nextProjectBrowserSort("inbound", "desc", "inbound")).toEqual({
      sort: "inbound",
      sortDir: "asc",
    });
    expect(nextProjectBrowserSort("inbound", "desc", "name")).toEqual({
      sort: "name",
      sortDir: "asc",
    });
  });
});
