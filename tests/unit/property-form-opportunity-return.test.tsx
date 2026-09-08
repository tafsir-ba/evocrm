import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

vi.mock("@/lib/use-workspace-project-filter", () => ({
  useWorkspaceProjectFilter: () => null,
}));

vi.mock("@/components/domain/member-selector", () => ({
  MemberSelector: () => <div data-testid="member-selector" />,
}));

vi.mock("@/components/domain/project-selector", () => ({
  ProjectSelector: () => <div data-testid="project-selector" />,
}));

vi.mock("@/components/domain/tag-selector", () => ({
  TagSelector: () => <div data-testid="tag-selector" />,
}));

vi.mock("@/components/domain/locale-selectors", () => ({
  CurrencySelect: () => <div data-testid="currency-select" />,
}));

vi.mock("@/components/properties/property-media-section", () => ({
  PropertyFormPhotosSection: () => null,
  addPropertyPhotoDrafts: () => [],
  removePropertyPhotoDraft: () => [],
}));

import { PropertyFormPage } from "@/components/properties/property-form-page";

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({ data }),
  } as Response;
}

describe("PropertyFormPage opportunity return flow", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    push.mockReset();
    refresh.mockReset();

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/dictionary-items?type=property_status")) {
        return jsonResponse({
          items: [{ id: "status-1", label: "Available", isDefault: true }],
        });
      }
      if (url.includes("/dictionary-items?type=property_type")) {
        return jsonResponse({ items: [] });
      }
      if (url.includes("/tags?")) {
        return jsonResponse({ tags: [] });
      }
      if (url.includes("/members")) {
        return jsonResponse({ members: [] });
      }
      if (url.includes("/projects")) {
        return jsonResponse({
          projects: [{ id: "proj-1", name: "Riviera", code: "RIV" }],
        });
      }
      if (url.endsWith("/properties")) {
        return jsonResponse({ property: { id: "prop-new" } }, 201);
      }
      return jsonResponse({});
    }) as typeof fetch;
  });

  it("after create, returns to New Opportunity with locked lead and new property", async () => {
    const user = userEvent.setup();
    const returnTo = "/w/demo/opportunities/new?leadId=lead-1&lockLead=1";

    render(
      <PropertyFormPage
        workspaceSlug="demo"
        defaultCurrency="CHF"
        mode="create"
        initialValues={{ projectId: "proj-1", title: "New Flat", statusId: "status-1" }}
        returnTo={returnTo}
        cancelHref={returnTo}
      />,
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/dictionary-items?type=property_status"),
      );
    });

    await user.click(screen.getByRole("button", { name: /Create property|Save/i }));

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith(
        "/w/demo/opportunities/new?leadId=lead-1&lockLead=1&propertyId=prop-new",
      );
    });
  });
});
