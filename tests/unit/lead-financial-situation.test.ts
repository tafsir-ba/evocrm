import { describe, expect, it } from "vitest";

import {
  applyOccupationalEstimateToSnapshot,
  confidenceFromOccupationalPercent,
  emptyFinancialSnapshot,
  inferEmploymentTypeFromJobTitle,
  isHumanEnteredFinancialSource,
  occupationalEstimateMidpoint,
  workingFiguresFromOccupationalEstimate,
  type MarketIncomeEstimate,
} from "@/lib/lead-financial-situation";

function estimate(overrides: Partial<MarketIncomeEstimate> = {}): MarketIncomeEstimate {
  return {
    rangeMin: 180000,
    rangeMax: 260000,
    currency: "CHF",
    methodology: "Swiss agency owner band",
    sources: [{ url: "https://stats.example/wages", title: "Wage table" }],
    confidencePercent: 35,
    jobTitleUsed: "Owner and Manager",
    locationUsed: "Switzerland",
    retrievedAt: "2026-08-31T12:00:00.000Z",
    aiModel: "gpt-test",
    searchProvider: "tavily",
    reviewed: false,
    reviewedBy: null,
    reviewedAt: null,
    disclaimer: "test",
    ...overrides,
  };
}

describe("occupational working figures", () => {
  it("treats declared / advisor / document as human-entered", () => {
    expect(isHumanEnteredFinancialSource("declared_by_lead")).toBe(true);
    expect(isHumanEnteredFinancialSource("advisor")).toBe(true);
    expect(isHumanEnteredFinancialSource("document")).toBe(true);
    expect(isHumanEnteredFinancialSource("occupational_estimate")).toBe(false);
    expect(isHumanEnteredFinancialSource("other")).toBe(false);
    expect(isHumanEnteredFinancialSource(null)).toBe(false);
  });

  it("infers employment from the job title for a broker working figure", () => {
    expect(inferEmploymentTypeFromJobTitle("Owner and Manager")).toBe("self_employed");
    expect(inferEmploymentTypeFromJobTitle("Founder")).toBe("self_employed");
    expect(inferEmploymentTypeFromJobTitle("Managing Director")).toBe("company_director");
    expect(inferEmploymentTypeFromJobTitle("CTO")).toBe("employed");
    expect(inferEmploymentTypeFromJobTitle("Avocat")).toBe("employed");
    expect(inferEmploymentTypeFromJobTitle("Head of Sales")).toBe("employed");
    expect(inferEmploymentTypeFromJobTitle("Retired teacher")).toBe("retired");
  });

  it("uses a rounded midpoint as the annual working income", () => {
    expect(occupationalEstimateMidpoint({ rangeMin: 180000, rangeMax: 260000 })).toBe(220000);
    expect(occupationalEstimateMidpoint({ rangeMin: 149400, rangeMax: 150600 })).toBe(150000);
    expect(occupationalEstimateMidpoint({ rangeMin: 180000, rangeMax: null })).toBe(180000);
    expect(occupationalEstimateMidpoint({ rangeMin: null, rangeMax: null })).toBeNull();
  });

  it("maps estimate confidence to low / medium, never high", () => {
    expect(confidenceFromOccupationalPercent(35)).toBe("low");
    expect(confidenceFromOccupationalPercent(40)).toBe("medium");
    expect(confidenceFromOccupationalPercent(60)).toBe("medium");
  });

  it("fills income, employment, discussion budget, and notes for the broker", () => {
    const working = workingFiguresFromOccupationalEstimate(estimate());
    expect(working).toMatchObject({
      declaredAnnualIncome: 220000,
      employmentType: "self_employed",
      targetPurchasePrice: 1_320_000,
      source: "occupational_estimate",
      asOfDate: "2026-08-31",
      confidence: "low",
      currency: "CHF",
    });
    expect(working?.affordabilityNotes).toMatch(/working figure for pitch/i);
    expect(working?.affordabilityNotes).toMatch(/Owner and Manager/);
    expect(working?.affordabilityNotes).toMatch(/replace/i);
  });

  it("pre-fills an empty snapshot so the form is usable", () => {
    const { snapshot, applied } = applyOccupationalEstimateToSnapshot({
      snapshot: emptyFinancialSnapshot("CHF"),
      estimate: estimate(),
    });
    expect(applied).toBe(true);
    expect(snapshot.declaredAnnualIncome).toBe(220000);
    expect(snapshot.employmentType).toBe("self_employed");
    expect(snapshot.targetPurchasePrice).toBe(1_320_000);
    expect(snapshot.availableDepositEquity).toBeNull();
    expect(snapshot.financingNeed).toBeNull();
    expect(snapshot.source).toBe("occupational_estimate");
  });

  it("refreshes a previous occupational estimate but keeps deposit and financing", () => {
    const { snapshot, applied } = applyOccupationalEstimateToSnapshot({
      snapshot: {
        ...emptyFinancialSnapshot("CHF"),
        declaredAnnualIncome: 100000,
        employmentType: "employed",
        availableDepositEquity: 80000,
        financingNeed: 400000,
        source: "occupational_estimate",
        affordabilityNotes: "old",
      },
      estimate: estimate({ rangeMin: 200000, rangeMax: 240000, confidencePercent: 50 }),
    });
    expect(applied).toBe(true);
    expect(snapshot.declaredAnnualIncome).toBe(220000);
    expect(snapshot.availableDepositEquity).toBe(80000);
    expect(snapshot.financingNeed).toBe(400000);
    expect(snapshot.source).toBe("occupational_estimate");
  });

  it("does not overwrite figures a human already entered", () => {
    const human = {
      ...emptyFinancialSnapshot("CHF"),
      declaredAnnualIncome: 310000,
      employmentType: "company_director" as const,
      targetPurchasePrice: 2_000_000,
      source: "declared_by_lead" as const,
      affordabilityNotes: "Lead said 310k on the call",
    };
    const { snapshot, applied } = applyOccupationalEstimateToSnapshot({
      snapshot: human,
      estimate: estimate(),
    });
    expect(applied).toBe(false);
    expect(snapshot).toEqual(human);
  });
});
