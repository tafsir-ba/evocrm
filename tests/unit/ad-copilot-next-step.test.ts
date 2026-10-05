import { describe, expect, it } from "vitest";

import {
  buildAdCopilotNextStep,
  countAttributedFunnelOutcomes,
  emptyAdCopilotFunnel,
} from "@/lib/ad-copilot-next-step";

const JARGON =
  /cpc|cpm|ctr|roas|cpql|cpl|last[- ]touch|consent snapshot|graph api|mutate|publish|budget/i;

function step(overrides: Partial<Parameters<typeof buildAdCopilotNextStep>[0]> = {}) {
  return buildAdCopilotNextStep({
    freshness: "fresh",
    spend: 0,
    clicks: 0,
    funnel: emptyAdCopilotFunnel(),
    ...overrides,
  });
}

describe("Ad Copilot What to do next", () => {
  it("counts attributed funnel milestones and ignores lost", () => {
    expect(
      countAttributedFunnelOutcomes([
        "form_lead",
        "form_lead",
        "qualified_lead",
        "opportunity_created",
        "won",
        "lost",
      ]),
    ).toEqual({
      formLeads: 2,
      qualifiedLeads: 1,
      opportunities: 1,
      wins: 1,
    });
  });

  it("stale data always asks to refresh in Settings first", () => {
    const stale = step({
      freshness: "stale",
      spend: 120,
      clicks: 40,
      funnel: { formLeads: 3, qualifiedLeads: 2, opportunities: 1, wins: 1 },
    });
    expect(stale.kind).toBe("refresh_data");
    expect(stale.needsSettingsRefresh).toBe(true);
    expect(stale.nextAction).toMatch(/Settings → Paid ads/i);
    expect(stale.nextAction).toMatch(/Refresh now/i);

    expect(step({ freshness: "untrusted" }).kind).toBe("refresh_data");
    expect(step({ freshness: "never_synced" }).kind).toBe("refresh_data");
    expect(step({ freshness: "never_synced" }).title).toMatch(/load/i);
  });

  it("spend or clicks with no attributed form path asks to check landing tracking", () => {
    const fromSpend = step({ spend: 50, clicks: 0 });
    const fromClicks = step({ spend: 0, clicks: 12 });
    expect(fromSpend.kind).toBe("check_landing_tracking");
    expect(fromClicks.kind).toBe("check_landing_tracking");
    expect(fromSpend.nextAction).toMatch(/landing page form/i);
    expect(fromSpend.needsSettingsRefresh).toBe(false);
  });

  it("does not ask for landing tracking when later funnel outcomes exist", () => {
    expect(
      step({
        spend: 80,
        funnel: { formLeads: 0, qualifiedLeads: 1, opportunities: 0, wins: 0 },
      }).kind,
    ).toBe("focus_qualified_leads");
  });

  it("form fills without good leads asks to review quality and targeting", () => {
    const result = step({
      funnel: { formLeads: 4, qualifiedLeads: 0, opportunities: 0, wins: 0 },
    });
    expect(result.kind).toBe("review_lead_quality");
    expect(result.nextAction).toMatch(/lead quality/i);
    expect(result.nextAction).toMatch(/right people/i);
  });

  it("shows the right positive focus for good leads, pipeline, and wins", () => {
    expect(
      step({
        funnel: { formLeads: 2, qualifiedLeads: 1, opportunities: 0, wins: 0 },
      }).kind,
    ).toBe("focus_qualified_leads");
    expect(
      step({
        funnel: { formLeads: 2, qualifiedLeads: 1, opportunities: 1, wins: 0 },
      }).kind,
    ).toBe("focus_opportunities");
    expect(
      step({
        funnel: { formLeads: 2, qualifiedLeads: 1, opportunities: 1, wins: 1 },
      }).kind,
    ).toBe("focus_wins");
  });

  it("waits when there is no spend, clicks, or attributed outcomes", () => {
    const result = step();
    expect(result.kind).toBe("waiting_for_activity");
    expect(result.needsSettingsRefresh).toBe(true);
  });

  it("keeps copy kids-friendly and never suggests mutations", () => {
    const cases = [
      step({ freshness: "stale" }),
      step({ spend: 10 }),
      step({ funnel: { formLeads: 1, qualifiedLeads: 0, opportunities: 0, wins: 0 } }),
      step({ funnel: { formLeads: 1, qualifiedLeads: 1, opportunities: 0, wins: 0 } }),
      step({ funnel: { formLeads: 1, qualifiedLeads: 1, opportunities: 1, wins: 0 } }),
      step({ funnel: { formLeads: 1, qualifiedLeads: 1, opportunities: 1, wins: 1 } }),
      step(),
    ];

    for (const result of cases) {
      const blob = `${result.title} ${result.explanation} ${result.nextAction}`;
      expect(blob).not.toMatch(JARGON);
    }
  });
});
