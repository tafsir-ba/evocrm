import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

import { ProjectFormPage } from "@/components/projects/project-form-page";

const COMPANY_ID = "507f1f77bcf86cd7994390aa";
const MEMBER_ID = "507f1f77bcf86cd7994390bb";
const PROPERTY_TYPE_ID = "507f1f77bcf86cd7994390cc";

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({ data }),
  } as Response;
}

function mockWorkspaceFetch() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (url.endsWith("/companies") && method === "GET") {
      return jsonResponse({ companies: [{ id: COMPANY_ID, name: "Promotor SA" }] });
    }
    if (url.endsWith("/companies") && method === "POST") {
      return jsonResponse({ company: { id: COMPANY_ID, name: "Promotor SA" }, created: false }, 200);
    }
    if (url.includes("/members")) {
      return jsonResponse({
        members: [{ userId: MEMBER_ID, name: "Alex Portfolio", email: "alex@example.com" }],
      });
    }
    if (url.includes("property_type")) {
      return jsonResponse({
        items: [{ id: PROPERTY_TYPE_ID, label: "Apartment", isActive: true }],
      });
    }
    if (url.endsWith("/projects") && method === "POST") {
      return jsonResponse({ project: { id: "507f1f77bcf86cd7994390dd" } }, 201);
    }
    return jsonResponse({});
  }) as typeof fetch;
}

describe("ProjectFormPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    push.mockReset();
    refresh.mockReset();
    global.fetch = mockWorkspaceFetch();
  });

  it("shows essentials and keeps advanced details collapsed", async () => {
    render(<ProjectFormPage workspaceSlug="demo" mode="create" />);

    expect(await screen.findByLabelText(/Project \/ development name/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Internal reference/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Primary company/)).toBeInTheDocument();
    expect(screen.getByText(/company this development is for/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Commercial stage")).toBeInTheDocument();
    expect(screen.getByLabelText("Project type")).toBeInTheDocument();
    expect(screen.getByLabelText("Property type")).toBeInTheDocument();
    expect(screen.getByLabelText("Project owner")).toBeInTheDocument();
    expect(screen.getByLabelText("Country")).toHaveDisplayValue("Switzerland");
    expect(screen.getByLabelText("Canton")).toBeInTheDocument();
    expect(screen.getByLabelText("Postal code")).toBeInTheDocument();
    expect(screen.getByLabelText("Locality / municipality")).toBeInTheDocument();
    expect(screen.getByLabelText("Address / project area")).toBeInTheDocument();

    expect(screen.queryByLabelText("Description")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Website")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Assigned to")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("City")).not.toBeInTheDocument();
    expect(screen.queryByText(/dripping|enroll/i)).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /More details/ }));

    expect(screen.getByLabelText("Description")).toBeInTheDocument();
    expect(screen.getByLabelText("Website")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add another company" })).toBeInTheDocument();
  });

  it("creates a project with structured location and a primary developer", async () => {
    const user = userEvent.setup();
    render(<ProjectFormPage workspaceSlug="demo" mode="create" />);

    await screen.findByLabelText(/Project \/ development name/);
    await user.type(screen.getByLabelText(/Project \/ development name/), "Les Terrasses");
    await user.type(screen.getByLabelText(/Internal reference/), "LT-01");
    await user.selectOptions(screen.getByLabelText(/Primary company/), COMPANY_ID);
    await user.selectOptions(screen.getByLabelText("Commercial stage"), "pre_launch");
    await user.selectOptions(screen.getByLabelText("Project type"), "development");
    await user.selectOptions(screen.getByLabelText("Property type"), PROPERTY_TYPE_ID);
    await user.selectOptions(screen.getByLabelText("Project owner"), MEMBER_ID);
    await user.selectOptions(screen.getByLabelText("Canton"), "GE");
    await user.type(screen.getByLabelText("Postal code"), "1201");
    await user.type(screen.getByLabelText("Locality / municipality"), "Geneva");
    await user.type(screen.getByLabelText("Address / project area"), "Quai du Mont-Blanc");
    await user.click(screen.getByRole("button", { name: "Create project" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/workspaces/demo/projects",
        expect.objectContaining({ method: "POST" }),
      );
    });

    const createCall = vi.mocked(global.fetch).mock.calls.find(([url, init]) => {
      return String(url).endsWith("/projects") && init?.method === "POST";
    });
    expect(createCall).toBeTruthy();
    const body = JSON.parse(String(createCall?.[1]?.body));

    expect(body).toMatchObject({
      name: "Les Terrasses",
      reference: "LT-01",
      commercialStage: "pre_launch",
      projectType: "development",
      propertyTypeId: PROPERTY_TYPE_ID,
      ownerId: MEMBER_ID,
      companies: [{ companyId: COMPANY_ID, role: "developer", isPrimary: true }],
      location: expect.objectContaining({
        countryCode: "CH",
        countryName: "Switzerland",
        cantonCode: "GE",
        postalCode: "1201",
        municipality: "Geneva",
        normalizedAddress: "Quai du Mont-Blanc",
      }),
    });
    expect(body.city).toBeUndefined();
    expect(body.campaignId).toBeUndefined();
    expect(body.enroll).toBeUndefined();
    expect(push).toHaveBeenCalledWith("/w/demo/projects/507f1f77bcf86cd7994390dd");
  });

  it("does not create without a primary company", async () => {
    const user = userEvent.setup();
    render(<ProjectFormPage workspaceSlug="demo" mode="create" />);

    await screen.findByLabelText(/Project \/ development name/);
    expect(screen.getByLabelText(/Primary company/)).toBeRequired();
    await user.type(screen.getByLabelText(/Project \/ development name/), "Orphan Development");
    await user.click(screen.getByRole("button", { name: "Create project" }));

    expect(
      vi.mocked(global.fetch).mock.calls.some(([url, init]) => {
        return String(url).endsWith("/projects") && init?.method === "POST";
      }),
    ).toBe(false);
  });

  it("does not require coordinates to create", async () => {
    render(<ProjectFormPage workspaceSlug="demo" mode="create" />);

    await screen.findByLabelText(/Project \/ development name/);
    expect(screen.queryByLabelText("Latitude")).not.toBeInTheDocument();
    expect(screen.getByText(/not required to create/i)).toBeInTheDocument();
  });
});
