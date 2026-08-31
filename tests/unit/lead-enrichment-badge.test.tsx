import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/w/demo/leads/lead-1",
}));

import { FieldOriginBadge } from "@/components/leads/field-origin-badge";
import { EnrichedField } from "@/components/leads/enriched-field";

describe("enrichment origin badge", () => {
  it("marks enriched values distinctly from CRM-entered values", () => {
    const { rerender } = render(<FieldOriginBadge method="enrichment" />);
    expect(screen.getByText("Enriched")).toBeTruthy();
    rerender(<FieldOriginBadge method="manual" />);
    expect(screen.getByText("CRM")).toBeTruthy();
  });

  it("shows confidence and source links on enriched profile values", () => {
    render(
      <EnrichedField
        value="Head of Sales"
        origin="enrichment"
        suggestion={{
          id: "sug-1",
          fieldKey: "jobTitle",
          proposedValue: "Head of Sales",
          currentValue: null,
          currentOrigin: null,
          confidencePercent: 86,
          rationale: "Public team page",
          sourceUrls: ["https://www.example-corp.ch/team/amira-keller"],
          retrievedAt: "2026-08-31T12:00:00.000Z",
          searchProvider: "demo_fixture",
          aiModel: "demo-fixture",
          status: "accepted",
          acceptedValue: "Head of Sales",
          previousValue: null,
          previousProvenance: null,
          overwriteAcknowledged: false,
          decidedBy: "user-1",
          decidedAt: "2026-08-31T12:00:00.000Z",
        }}
      />,
    );
    expect(screen.getByText(/Enriched/)).toBeTruthy();
    expect(screen.getByText(/86%/)).toBeTruthy();
    expect(screen.getByText("https://www.example-corp.ch/team/amira-keller")).toBeTruthy();
    expect(screen.getByText(/not a truth claim/i)).toBeTruthy();
  });

  it("pulses newly revealed enriched values", () => {
    const { container } = render(
      <EnrichedField
        value="Head of Sales"
        origin="enrichment"
        reveal
        suggestion={{
          id: "sug-1",
          fieldKey: "jobTitle",
          proposedValue: "Head of Sales",
          currentValue: null,
          currentOrigin: null,
          confidencePercent: 86,
          rationale: "Public team page",
          sourceUrls: ["https://www.example-corp.ch/team/amira-keller"],
          retrievedAt: "2026-08-31T12:00:00.000Z",
          searchProvider: "demo_fixture",
          aiModel: "demo-fixture",
          status: "accepted",
          acceptedValue: "Head of Sales",
          previousValue: null,
          previousProvenance: null,
          overwriteAcknowledged: false,
          decidedBy: "user-1",
          decidedAt: "2026-08-31T12:00:00.000Z",
        }}
      />,
    );
    expect(container.querySelector(".enrich-reveal")).toBeTruthy();
  });
});
