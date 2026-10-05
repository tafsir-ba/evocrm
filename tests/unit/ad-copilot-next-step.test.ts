import { describe, expect, it } from "vitest";

import {
  buildAdCopilotNextStep,
  countAttributedFunnelOutcomes,
  emptyAdCopilotFunnel,
} from "@/lib/ad-copilot-next-step";

const JARGON =
  /cpc|cpm|ctr|roas|cpql|cpl|last[- ]touch|consent snapshot|graph api|mutate|publish|budget/i;

function step(
  overrides: Partial<Parameters<typeof buildAdCopilotNextStep>[0]> = {},
) {
  return buildAdCopilotNextStep({
    freshness: "fresh",
    freshnessLabel: "Updated recently",
    spend: 0,
    clicks: 0,
    funnel: emptyAdCopilotFunnel(),
    ...overrides,
  });
}

function assertStructured(result: ReturnType<typeof buildAdCopilotNextStep>) {
  expect(result.title.length).toBeGreaterThan(0);
  expect(result.whatNumbersSay.length).toBeGreaterThan(0);
  expect(result.whyItMatters.length).toBeGreaterThan(0);
  expect(result.manualNextStep.length).toBeGreaterThan(0);
  expect(result.evidenceLabel.length).toBeGreaterThan(0);
  expect(result.nextAction).toBe(result.manualNextStep);
  expect(result.explanation).toBe(result.whyItMatters);
}

describe("Ad Copilot Action Center recommendations", () => {
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

  it("stale / untrusted / never-synced data always asks to refresh first", () => {
    const stale = step({
      freshness: "stale",
      freshnessLabel: "Needs a refresh soon",
      spend: 120,
      clicks: 40,
      funnel: { formLeads: 3, qualifiedLeads: 2, opportunities: 1, wins: 1 },
    });
    expect(stale.kind).toBe("refresh_data");
    expect(stale.needsSettingsRefresh).toBe(true);
    expect(stale.manualNextStep).toMatch(/Settings → Paid ads/i);
    expect(stale.manualNextStep).toMatch(/Refresh now/i);
    expect(stale.evidenceLabel).toBe("Needs a refresh soon");
    assertStructured(stale);

    expect(step({ freshness: "untrusted" }).kind).toBe("refresh_data");
    expect(step({ freshness: "never_synced" }).kind).toBe("refresh_data");
    expect(step({ freshness: "never_synced" }).title).toMatch(/load/i);
  });

  it("spend or clicks with no attributed form path asks to check landing tracking", () => {
    const fromSpend = step({ spend: 50, clicks: 0 });
    const fromClicks = step({ spend: 0, clicks: 12 });
    expect(fromSpend.kind).toBe("check_landing_tracking");
    expect(fromClicks.kind).toBe("check_landing_tracking");
    expect(fromSpend.whatNumbersSay).toMatch(/spend|click/i);
    expect(fromSpend.manualNextStep).toMatch(/landing page form/i);
    expect(fromSpend.needsSettingsRefresh).toBe(false);
    assertStructured(fromSpend);
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
    expect(result.whatNumbersSay).toMatch(/4 people filled/i);
    expect(result.manualNextStep).toMatch(/lead quality/i);
    expect(result.manualNextStep).toMatch(/right people/i);
    assertStructured(result);
  });

  it("qualified leads without opportunities asks to follow up good leads", () => {
    const result = step({
      funnel: { formLeads: 2, qualifiedLeads: 1, opportunities: 0, wins: 0 },
    });
    expect(result.kind).toBe("focus_qualified_leads");
    expect(result.title).toMatch(/good leads/i);
    expect(result.whatNumbersSay).toMatch(/opportunit/i);
    assertStructured(result);
  });

  it("opportunities without wins asks to keep pipeline moving", () => {
    const result = step({
      funnel: { formLeads: 2, qualifiedLeads: 1, opportunities: 1, wins: 0 },
    });
    expect(result.kind).toBe("focus_opportunities");
    expect(result.whatNumbersSay).toMatch(/pipeline|won/i);
    assertStructured(result);
  });

  it("wins are the healthy state", () => {
    const result = step({
      funnel: { formLeads: 2, qualifiedLeads: 1, opportunities: 1, wins: 1 },
    });
    expect(result.kind).toBe("focus_wins");
    expect(result.title).toMatch(/win a sale/i);
    assertStructured(result);
  });

  it("waits when there is no spend, clicks, or attributed outcomes", () => {
    const result = step();
    expect(result.kind).toBe("waiting_for_activity");
    expect(result.needsSettingsRefresh).toBe(true);
    expect(result.evidenceLabel).toBe("Updated recently");
    assertStructured(result);
  });

  it("keeps copy kids-friendly and never suggests mutations", () => {
    const cases = [
      step({ freshness: "stale", freshnessLabel: "Needs a refresh soon" }),
      step({ spend: 10 }),
      step({
        funnel: { formLeads: 1, qualifiedLeads: 0, opportunities: 0, wins: 0 },
      }),
      step({
        funnel: { formLeads: 1, qualifiedLeads: 1, opportunities: 0, wins: 0 },
      }),
      step({
        funnel: { formLeads: 1, qualifiedLeads: 1, opportunities: 1, wins: 0 },
      }),
      step({
        funnel: { formLeads: 1, qualifiedLeads: 1, opportunities: 1, wins: 1 },
      }),
      step(),
    ];

    for (const result of cases) {
      const blob = `${result.title} ${result.whatNumbersSay} ${result.whyItMatters} ${result.manualNextStep}`;
      expect(blob).not.toMatch(JARGON);
      expect(blob).not.toMatch(/automatically (publish|pause|change)/i);
    }
  });
});
