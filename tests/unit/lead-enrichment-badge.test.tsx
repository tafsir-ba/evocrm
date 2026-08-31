import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/w/demo/leads/lead-1",
}));

import { FieldOriginBadge } from "@/components/leads/field-origin-badge";

describe("enrichment origin badge", () => {
  it("marks enriched values distinctly from CRM-entered values", () => {
    const { rerender } = render(<FieldOriginBadge method="enrichment" />);
    expect(screen.getByText("Enriched")).toBeTruthy();
    rerender(<FieldOriginBadge method="manual" />);
    expect(screen.getByText("CRM")).toBeTruthy();
  });
});
