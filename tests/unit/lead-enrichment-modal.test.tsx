import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LeadEnrichmentModal } from "@/components/leads/lead-enrichment-modal";

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    json: async () => body,
  } as Response;
}

describe("LeadEnrichmentModal", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("auto-closes onto the profile after a unique match", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          data: {
            run: {
              id: "run-1",
              status: "accepted",
              identityMatch: "unique",
              identityRationale: null,
              failureMessage: null,
              demoMode: true,
            },
          },
        }),
      ),
    );
    const onApplied = vi.fn();
    const onClose = vi.fn();
    render(
      <LeadEnrichmentModal
        open
        onClose={onClose}
        workspaceSlug="demo"
        leadId="lead-1"
        onApplied={onApplied}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Profile filled")).toBeTruthy();
    });
    expect(onApplied).toHaveBeenCalledWith({
      id: "run-1",
      status: "accepted",
      identityMatch: "unique",
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: 1500 });
  });

  it("lets the operator pick among several people instead of auto-applying", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          run: {
            id: "run-3",
            status: "reviewing",
            identityMatch: "unique",
            identityRationale: "Two professionals share this name.",
            failureMessage: null,
            demoMode: true,
            selectedCandidateId: null,
            candidates: [
              {
                id: "cand-1",
                label: "Mélina Roulet — Social Scientist · Commugny",
                headline: "Social Scientist",
                employer: null,
                location: "Commugny, Switzerland",
                profileUrl: "https://example.com/gis",
                sourceUrls: ["https://example.com/gis"],
                confidencePercent: 80,
                mostLikely: true,
                suggestions: [],
                summary: { text: "", citationUrls: [] },
              },
              {
                id: "cand-2",
                label: "Mélina Roulet — Orthopaedic Surgery Resident · Lausanne",
                headline: "Orthopaedic Surgery Resident",
                employer: "HFR",
                location: "Lausanne, Switzerland",
                profileUrl: "https://example.com/ortho",
                sourceUrls: ["https://example.com/ortho"],
                confidencePercent: 82,
                mostLikely: false,
                suggestions: [],
                summary: { text: "", citationUrls: [] },
              },
            ],
          },
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onApplied = vi.fn();
    const onClose = vi.fn();
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();

    render(
      <LeadEnrichmentModal
        open
        onClose={onClose}
        workspaceSlug="demo"
        leadId="lead-1"
        onApplied={onApplied}
      />,
    );

    expect(await screen.findByText(/most likely/i)).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "Choose Mélina Roulet — Orthopaedic Surgery Resident · Lausanne",
      }),
    ).toBeTruthy();
    expect(onApplied).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          run: {
            id: "run-3",
            status: "accepted",
            identityMatch: "unique",
            identityRationale: null,
            failureMessage: null,
            demoMode: true,
            selectedCandidateId: "cand-2",
            candidates: [],
          },
        },
      }),
    );

    await user.click(
      screen.getByRole("button", {
        name: "Choose Mélina Roulet — Orthopaedic Surgery Resident · Lausanne",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Apply this person" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/workspaces/demo/leads/lead-1/enrichment/run-3/candidates",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ candidateId: "cand-2" }),
        }),
      );
    });
    expect(onApplied).toHaveBeenCalledWith(
      expect.objectContaining({ id: "run-3", selectedCandidateId: "cand-2" }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("stays open when identity is ambiguous", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          data: {
            run: {
              id: "run-2",
              status: "ambiguous",
              identityMatch: "ambiguous",
              identityRationale: "Several people match this name.",
              failureMessage: null,
              demoMode: true,
            },
          },
        }),
      ),
    );
    const onApplied = vi.fn();
    const onClose = vi.fn();
    render(
      <LeadEnrichmentModal
        open
        onClose={onClose}
        workspaceSlug="demo"
        leadId="lead-1"
        onApplied={onApplied}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Several people match this name.")).toBeTruthy();
    });
    expect(onApplied).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText("Close")).toBeTruthy();
  });
});
