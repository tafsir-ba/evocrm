import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/use-workspace-project-filter", () => ({
  useWorkspaceProjectFilter: () => null,
}));

import { LeadFormPage } from "@/components/leads/lead-form-page";

const statuses = [
  {
    id: "status-new",
    label: "New",
    color: "#3B82F6",
    key: "new",
    isDefault: true,
  },
  {
    id: "status-qualified",
    label: "Qualified",
    color: "#10B981",
    key: "qualified",
  },
];

const members = [
  { userId: "user-1", name: "Ada Owner", email: "ada@example.com" },
  { userId: "user-2", name: "Bea Owner", email: "bea@example.com" },
  { userId: "user-3", name: "Cam Owner", email: "cam@example.com" },
];

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({ data }),
  } as Response;
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function editForm() {
  return (
    <LeadFormPage
      workspaceSlug="evo-crm"
      mode="edit"
      leadId="lead-1"
      cancelHref="/w/evo-crm/leads/lead-1"
      initialValues={{
        firstName: "Mia",
        lastName: "Keller",
        statusId: "status-new",
        notes: "Call back tomorrow",
        assignedTo: "user-1",
      }}
    />
  );
}

describe("lead edit status and owner", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("enables Status while members are still loading, then shows the members", async () => {
    const user = userEvent.setup();
    const membersGate = deferred<Response>();

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/dictionary-items?type=lead_status")) {
        return jsonResponse({ items: statuses });
      }
      if (url.includes("/members")) {
        return membersGate.promise;
      }
      if (url.includes("/dictionary-items?type=lead_source")) {
        return jsonResponse({ items: [] });
      }
      if (url.includes("/tags?")) {
        return jsonResponse({ tags: [] });
      }
      if (url.includes("/companies")) {
        return jsonResponse({ companies: [] });
      }
      if (url.includes("/projects")) {
        return jsonResponse({ projects: [] });
      }
      return jsonResponse({});
    }) as typeof fetch;

    render(editForm());

    const status = await screen.findByLabelText(/Status/);
    await waitFor(() => {
      expect(status).toBeEnabled();
    });
    expect(
      screen.queryByText("No workspace members available"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Loading workspace members…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();

    await user.selectOptions(status, "status-qualified");
    expect(status).toHaveValue("status-qualified");

    membersGate.resolve(jsonResponse({ members }));

    const owner = await screen.findByLabelText(/Assigned to/);
    expect(owner).toHaveTextContent("Ada Owner (ada@example.com)");
    expect(owner).toHaveTextContent("Bea Owner (bea@example.com)");
    expect(owner).toHaveTextContent("Cam Owner (cam@example.com)");
    expect(
      screen.queryByText("No workspace members available"),
    ).not.toBeInTheDocument();
    expect(status).toBeEnabled();
    expect(status).toHaveValue("status-qualified");
  });

  it("keeps Status usable when the members request fails or returns an empty list", async () => {
    const user = userEvent.setup();

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/dictionary-items?type=lead_status")) {
        return jsonResponse({ items: statuses });
      }
      if (url.includes("/members")) {
        return jsonResponse({ message: "nope" }, 500);
      }
      if (url.includes("/dictionary-items?type=lead_source")) {
        return jsonResponse({ items: [] });
      }
      if (url.includes("/tags?")) {
        return jsonResponse({ tags: [] });
      }
      if (url.includes("/companies")) {
        return jsonResponse({ companies: [] });
      }
      if (url.includes("/projects")) {
        return jsonResponse({ projects: [] });
      }
      return jsonResponse({});
    }) as typeof fetch;

    render(editForm());

    const status = await screen.findByLabelText(/Status/);
    await waitFor(() => {
      expect(status).toBeEnabled();
    });
    expect(
      await screen.findByText("No workspace members available"),
    ).toBeInTheDocument();

    await user.selectOptions(status, "status-qualified");
    expect(status).toHaveValue("status-qualified");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });
});
