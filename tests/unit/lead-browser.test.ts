import { describe, expect, it } from "vitest";

import {
  agePresetToCreatedRange,
  compareLeadsForBrowser,
  matchesLeadNextFilter,
  matchesLeadUrgencyFilter,
  nextLeadBrowserSort,
  paginateLeadBrowser,
  needsLeadBrowserMemoryPath,
} from "@/lib/lead-browser";

const now = new Date("2026-08-30T12:00:00.000Z");

const leadA = {
  id: "a",
  fullName: "Alice Zeta",
  phone: "+41 79 111 11 11",
  createdAt: "2026-08-29T12:00:00.000Z",
  company: { id: "c1", name: "Bosch" },
  project: { id: "p1", name: "Satigny duplex" },
  source: { id: "s1", label: "Website" },
  status: { id: "st1", label: "Contacted" },
  assignedUser: { id: "u1", name: "Camille", email: "camille@example.com" },
  tagsResolved: [{ id: "t1", name: "VIP" }],
  nextAction: { id: "n1", title: "Call back", at: "2026-08-28T09:00:00.000Z" },
  lastActivity: { id: "l1", title: "Tried to call", at: "2026-08-30T11:00:00.000Z" },
};

const leadB = {
  id: "b",
  fullName: "Bob Alpha",
  phone: null,
  createdAt: "2026-08-30T10:00:00.000Z",
  company: { id: "c2", name: "Acme" },
  project: { id: "p2", name: "Alpine" },
  source: { id: "s2", label: "Portal" },
  status: { id: "st2", label: "Lost" },
  assignedUser: null,
  tagsResolved: [],
  nextAction: null,
  lastActivity: { id: "l2", title: "Imported", at: "2026-08-30T10:00:00.000Z" },
};

describe("lead browser", () => {
  it("toggles sort direction on the same column", () => {
    expect(nextLeadBrowserSort("age", "desc", "age")).toEqual({
      sort: "age",
      sortDir: "asc",
    });
    expect(nextLeadBrowserSort("age", "desc", "fullName")).toEqual({
      sort: "fullName",
      sortDir: "asc",
    });
  });

  it("sorts by company name and owner label", () => {
    expect(compareLeadsForBrowser(leadA, leadB, "company", "asc", now)).toBeGreaterThan(0);
    expect(compareLeadsForBrowser(leadA, leadB, "owner", "asc", now)).toBeLessThan(0);
  });

  it("matches next and urgency filters from derived timeline state", () => {
    expect(matchesLeadNextFilter(leadA, "overdue", now)).toBe(true);
    expect(matchesLeadNextFilter(leadB, "no_next", now)).toBe(true);
    expect(matchesLeadUrgencyFilter(leadA, "overdue", now)).toBe(true);
    expect(matchesLeadUrgencyFilter(leadB, "unassigned", now)).toBe(true);
  });

  it("paginates after applying memory filters", () => {
    const page = paginateLeadBrowser([leadA, leadB], {
      sort: "fullName",
      sortDir: "asc",
      urgencyFilter: "unassigned",
      page: 1,
      pageSize: 25,
      now,
    });

    expect(page.total).toBe(1);
    expect(page.leads[0]?.id).toBe("b");
  });

  it("uses the memory path for derived sorts and filters", () => {
    expect(needsLeadBrowserMemoryPath({ sort: "age" })).toBe(false);
    expect(needsLeadBrowserMemoryPath({ sort: "company" })).toBe(true);
    expect(needsLeadBrowserMemoryPath({ sort: "age", urgencyFilter: "stale" })).toBe(true);
  });

  it("maps age presets to created ranges", () => {
    expect(agePresetToCreatedRange("24h", now)).toEqual({
      createdFrom: new Date("2026-08-29T12:00:00.000Z"),
    });
    expect(agePresetToCreatedRange("older_30d", now)).toEqual({
      createdTo: new Date("2026-07-31T12:00:00.000Z"),
    });
  });
});
