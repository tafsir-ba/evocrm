import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

import { OpportunityFormPage } from "@/components/opportunities/opportunity-form-page";

function jsonResponse(data: unknown, extra?: Record<string, unknown>, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({ data, ...extra }),
  } as Response;
}

describe("OpportunityFormPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    push.mockReset();
    refresh.mockReset();

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/dictionary-items?type=opportunity_status")) {
        return jsonResponse({
          items: [{ id: "status-1", label: "New", isDefault: true, behavior: "open" }],
        });
      }
      if (url.includes("/dictionary-items?type=lost_reason")) {
        return jsonResponse({ items: [] });
      }
      if (url.includes("/tags?")) {
        return jsonResponse({ tags: [] });
      }
      if (url.includes("/members")) {
        return jsonResponse({ members: [] });
      }
      if (url.includes("/leads/lead-1") && !url.includes("pageSize")) {
        return jsonResponse({
          lead: {
            id: "lead-1",
            fullName: "Ada Lovelace",
            email: "ada@example.com",
            projectId: "proj-1",
            project: { id: "proj-1", name: "Riviera" },
          },
        });
      }
      if (url.includes("/properties/prop-1") && !url.includes("pageSize")) {
        return jsonResponse({
          property: {
            id: "prop-1",
            title: "Sea View",
            reference: "SV-1",
            currency: "CHF",
            projectId: "proj-1",
            project: { id: "proj-1", name: "Riviera" },
          },
        });
      }
      if (url.includes("/leads?") && url.includes("projectId=proj-1")) {
        return jsonResponse(
          [
            {
              id: "lead-2",
              fullName: "Same Project Lead",
              email: "same@example.com",
              project: { id: "proj-1", name: "Riviera" },
            },
          ],
          { pagination: { total: 1, page: 1, pageSize: 50, totalPages: 1 } },
        );
      }
      if (url.includes("/properties?") && url.includes("projectId=proj-1")) {
        return jsonResponse(
          [
            {
              id: "prop-2",
              title: "Same Project Property",
              reference: "SP-2",
              currency: "CHF",
              project: { id: "proj-1", name: "Riviera" },
            },
          ],
          { pagination: { total: 1, page: 1, pageSize: 50, totalPages: 1 } },
        );
      }
      if (url.includes("/leads?")) {
        return jsonResponse(
          Array.from({ length: 50 }, (_, index) => ({
            id: `lead-${index + 1}`,
            fullName: `Lead ${index + 1}`,
            email: null,
            project: { id: "proj-1", name: "Riviera" },
          })),
          { pagination: { total: 150, page: 1, pageSize: 50, totalPages: 3 } },
        );
      }
      if (url.includes("/properties?")) {
        return jsonResponse(
          [
            {
              id: "prop-other",
              title: "Other Project Home",
              reference: "OP-1",
              currency: "EUR",
              project: { id: "proj-9", name: "Other" },
            },
          ],
          { pagination: { total: 1, page: 1, pageSize: 50, totalPages: 1 } },
        );
      }
      if (url.endsWith("/opportunities") || url.includes("/opportunities/")) {
        return jsonResponse({ opportunity: { id: "opp-new" } }, undefined, 201);
      }
      return jsonResponse({});
    }) as typeof fetch;
  });

  it("hydrates locked lead context and scopes property search to the same project", async () => {
    const user = userEvent.setup();

    render(
      <OpportunityFormPage
        workspaceSlug="demo"
        defaultCurrency="CHF"
        mode="create"
        initialValues={{ leadId: "lead-1" }}
        lockLead
        cancelHref="/w/demo/leads/lead-1"
      />,
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/workspaces/demo/leads/lead-1"),
      );
    });

    expect(await screen.findByDisplayValue("Ada Lovelace")).toBeInTheDocument();

    const propertyInput = screen.getByRole("combobox", { name: "Property" });
    await user.click(propertyInput);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/properties?pageSize=50&projectId=proj-1"),
      );
    });

    expect(
      await screen.findByRole("option", { name: /Same Project Property/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Project “Riviera”/)).toBeInTheDocument();
  });

  it("allows editing linked lead and property in edit mode", async () => {
    render(
      <OpportunityFormPage
        workspaceSlug="demo"
        defaultCurrency="CHF"
        mode="edit"
        opportunityId="opp-1"
        initialValues={{
          leadId: "lead-1",
          propertyId: "prop-1",
          value: "100000",
          currency: "CHF",
        }}
        cancelHref="/w/demo/opportunities/opp-1"
      />,
    );

    expect(await screen.findByDisplayValue("Ada Lovelace")).toBeInTheDocument();
    expect(await screen.findByDisplayValue("Sea View")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Lead" })).not.toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Property" })).not.toBeDisabled();
  });
});
