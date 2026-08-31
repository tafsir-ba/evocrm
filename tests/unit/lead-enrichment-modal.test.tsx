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
