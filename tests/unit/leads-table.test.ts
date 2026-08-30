import { describe, expect, it } from "vitest";

import {
  formatActivityLine,
  formatCompactUtm,
  formatNextActionWhen,
  formatOwnerName,
  formatRelativeAge,
  formatSourceContext,
  telHref,
  visibleLeadTags,
} from "@/lib/leads-table";

const now = new Date("2026-08-30T12:00:00.000Z");

describe("leads table presentation", () => {
  it("formats compact relative ages", () => {
    expect(formatRelativeAge("2026-08-30T11:59:30.000Z", now)).toBe("<1m");
    expect(formatRelativeAge("2026-08-30T10:00:00.000Z", now)).toBe("2h");
    expect(formatRelativeAge("2026-08-27T12:00:00.000Z", now)).toBe("3d");
    expect(formatRelativeAge(null, now)).toBe("—");
  });

  it("prefers a Unicode owner name over email", () => {
    expect(
      formatOwnerName({
        id: "u1",
        name: "François Côté",
        email: "francois@example.com",
      }),
    ).toBe("François Côté");
    expect(formatOwnerName({ id: "u2", name: "  ", email: "renée@évohome.ch" })).toBe(
      "renée@évohome.ch",
    );
    expect(formatOwnerName(null)).toBe("—");
  });

  it("shows UTM context only when present", () => {
    expect(
      formatSourceContext("Website", {
        integration: { utm: { campaign: "Genève-Printemps", source: "google", medium: "cpc" } },
      }),
    ).toEqual({
      source: "Website",
      context: "Genève-Printemps · google · cpc",
    });
    expect(formatSourceContext(null, {})).toEqual({ source: "—", context: null });
    expect(formatCompactUtm(undefined)).toBeNull();
  });

  it("keeps two meaningful tags and reports overflow", () => {
    const tags = [
      { id: "1", name: "VIP" },
      { id: "2", name: "Genève" },
      { id: "3", name: "Chalet" },
    ];

    expect(visibleLeadTags(tags, 2)).toEqual({
      visible: [
        { id: "1", name: "VIP" },
        { id: "2", name: "Genève" },
      ],
      overflow: 1,
    });
    expect(visibleLeadTags(tags.slice(0, 1), 2).overflow).toBe(0);
  });

  it("builds tel links for international numbers", () => {
    expect(telHref("+41 79 123 45 67")).toBe("tel:+41791234567");
    expect(telHref("079 123 45 67")).toBe("tel:0791234567");
  });

  it("formats last activity and next action from real timeline data", () => {
    const localNow = new Date(2026, 7, 30, 12, 0, 0);

    expect(
      formatActivityLine({
        lastActivity: {
          id: "a1",
          title: "Appel François",
          at: new Date(2026, 7, 28, 12, 0, 0),
        },
        nextAction: {
          id: "a2",
          title: "Relance Genève",
          at: new Date(2026, 7, 31, 9, 0, 0),
        },
        now: localNow,
      }),
    ).toEqual({
      last: "2d · Appel François",
      next: "Tomorrow · Relance Genève",
    });
  });

  it("marks overdue next actions without inventing activity", () => {
    const localNow = new Date(2026, 7, 30, 12, 0, 0);
    expect(formatNextActionWhen(new Date(2026, 7, 28, 9, 0, 0), localNow)).toBe("Overdue 2d");
    expect(
      formatActivityLine({
        lastContactedAt: new Date(localNow.getTime() - 24 * 60 * 60 * 1000),
        now: localNow,
      }),
    ).toEqual({
      last: "1d",
      next: null,
    });
  });
});
