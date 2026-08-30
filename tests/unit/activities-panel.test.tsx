import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams("view=overdue"),
  usePathname: () => "/w/demo/activities",
}));

vi.mock("@/lib/use-workspace-project-filter", () => ({
  useWorkspaceProjectFilter: () => null,
}));

import { ActivitiesPanel } from "@/components/activities/activities-panel";

const sampleActivity = {
  id: "a1",
  title: "Relance Genève",
  description: null,
  dueDate: "2026-08-20T09:00:00.000Z",
  outcome: null,
  type: { id: "t1", label: "Call", color: "#2563EB", key: "call" },
  status: { id: "s1", label: "Pending", color: "#F59E0B", key: "pending", behavior: "pending" },
  lead: { id: "l1", fullName: "François Côté" },
  property: null,
  opportunity: null,
  assignedUser: { id: "u1", name: "Camille Müller", email: "camille@evo-home.ch" },
  isOverdue: true,
};

function jsonResponse(data: unknown) {
  return { ok: true, status: 200, json: async () => data } as Response;
}

describe("ActivitiesPanel compact list", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/activities?")) {
        return jsonResponse({ data: [sampleActivity], pagination: { total: 1 } });
      }
      if (url.includes("/dictionary-items?type=activity_type")) {
        return jsonResponse({ data: { items: [sampleActivity.type] } });
      }
      if (url.includes("/dictionary-items?type=activity_status")) {
        return jsonResponse({ data: { items: [sampleActivity.status] } });
      }
      if (url.includes("/members")) {
        return jsonResponse({ data: { members: [] } });
      }
      return jsonResponse({ error: { message: "Not found" } });
    }) as typeof fetch;
  });

  it("starts on the overdue worklist from the URL and keeps compact actions", async () => {
    render(
      <ActivitiesPanel
        workspaceSlug="demo"
        workspaceTimezone="Europe/Zurich"
        canCreate
        canUpdate
        canArchive
      />,
    );

    expect(await screen.findByText("Relance Genève")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Overdue" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByText("Call")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Complete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archive" })).toBeInTheDocument();
    expect(screen.queryByText("Create activities from a Lead")).not.toBeInTheDocument();
  });

  it("keeps type, status, and assignee filters behind disclosure", async () => {
    const user = userEvent.setup();
    render(
      <ActivitiesPanel
        workspaceSlug="demo"
        workspaceTimezone="Europe/Zurich"
        canCreate={false}
        canUpdate={false}
        canArchive={false}
      />,
    );

    expect(await screen.findByLabelText("Search activities")).toBeInTheDocument();
    expect(screen.queryByLabelText("Filter by type")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "More filters" }));
    expect(screen.getByLabelText("Filter by type")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter by status")).toBeInTheDocument();
  });
});
