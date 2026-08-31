import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/w/demo/dashboard",
}));

vi.mock("@/lib/use-workspace-project-filter", () => ({
  useWorkspaceProjectFilter: () => null,
}));

import { DashboardPanel } from "@/components/dashboard/dashboard-panel";

const dashboardData = {
  summary: {
    dateRange: {
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-08-30T12:00:00.000Z",
      timezone: "Europe/Zurich",
    },
    metrics: {
      newLeads: 12,
      importedLeads: 26149,
      activeOpportunities: 4,
      wonOpportunities: 2,
      lostOpportunities: 1,
      activePipelineValue: [{ currency: "CHF", amount: 850000 }],
      wonValue: [{ currency: "CHF", amount: 420000 }],
      activitiesDueToday: 1,
      overdueActivities: 2,
    },
    cmpReconciliation: {
      sourceCohortCount: 46,
      membershipCount: 0,
      overlapCount: 0,
      sourceOnlyCount: 46,
      membershipOnlyCount: 0,
      cmpProjects: [],
    },
  },
  pipeline: {
    stages: [
      {
        status: { id: "s1", label: "Qualified", color: "#10B981", behavior: "open" },
        count: 4,
        valueByCurrency: [{ currency: "CHF", amount: 850000 }],
        includeInOverview: true,
      },
    ],
    activePipelineValue: [{ currency: "CHF", amount: 850000 }],
    totalCount: 4,
  },
  activities: {
    overdue: {
      count: 2,
      items: [
        {
          id: "a-overdue",
          title: "Relance Genève",
          dueDate: "2026-08-20T09:00:00.000Z",
          type: { label: "Call", key: "call", color: "#2563EB" },
          assignedUser: { id: "u1", name: "Camille Müller", email: "camille@evo-home.ch" },
          relatedSummary: "François Côté",
        },
      ],
    },
    dueToday: {
      count: 1,
      items: [
        {
          id: "a-today",
          title: "Visit Les Terrasses",
          dueDate: "2026-08-30T14:00:00.000Z",
          type: { label: "Visit", key: "visit", color: "#0F766E" },
          assignedUser: { id: "u1", name: "Camille Müller", email: "camille@evo-home.ch" },
          relatedSummary: "Les Terrasses",
        },
      ],
    },
    upcoming: {
      items: [
        {
          id: "a-next",
          title: "Send brochure",
          dueDate: "2026-09-02T09:00:00.000Z",
          type: { label: "Email", key: "email", color: "#7C3AED" },
          assignedUser: null,
          relatedSummary: null,
        },
      ],
    },
  },
  sources: {
    sources: [
      { source: { id: "src-web", label: "Site web", color: "#6366F1" }, count: 8 },
      { source: { id: "src-hs", label: "HubSpot", color: "#F97316" }, count: 4 },
    ],
    total: 12,
  },
  properties: {
    statuses: [{ status: { id: "st1", label: "Disponible", color: "#10B981" }, count: 3 }],
    total: 3,
  },
  recentOpportunities: [
    {
      id: "opp-1",
      leadName: "François Côté",
      propertyTitle: "Attique Genève",
      propertyReference: "AG-12",
      status: { label: "Qualified", color: "#10B981" },
      value: 850000,
      currency: "CHF",
      updatedAt: "2026-08-29T12:00:00.000Z",
    },
  ],
};

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as Response;
}

describe("DashboardPanel operator view", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/dashboard?")) {
        return jsonResponse({ data: dashboardData });
      }
      if (url.includes("/projects?")) {
        return jsonResponse({
          data: {
            projects: [
              {
                id: "507f1f77bcf86cd799439061",
                name: "Les Terrasses",
                reference: "LT-01",
                archivedAt: null,
                createdAt: "2026-08-20T12:00:00.000Z",
                counts: {
                  leads: 12,
                  lastActivityAt: "2026-08-29T09:00:00.000Z",
                  lastGenuineInboundAt: "2026-08-29T09:00:00.000Z",
                  lastGenuineInboundBasis: "received_at",
                },
              },
            ],
          },
        });
      }
      return jsonResponse({ error: { message: "Not found" } }, 404);
    }) as typeof fetch;
  });

  it("shows actionable counts with worklist links and existing follow-ups", async () => {
    render(<DashboardPanel workspaceSlug="demo" workspaceTimezone="Europe/Zurich" />);

    expect(await screen.findByText("New leads")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^New leads/i })).toHaveAttribute(
      "href",
      expect.stringContaining("acquisition=genuine_inbound"),
    );
    expect(screen.getByRole("link", { name: /^Imported/i })).toHaveAttribute(
      "href",
      expect.stringContaining("acquisition=legacy_import"),
    );
    expect(screen.getByText("26149")).toBeInTheDocument();
    expect(screen.getByText("Excluded from new leads")).toBeInTheDocument();
    expect(screen.getByText("CMP source vs CRM membership")).toBeInTheDocument();
    expect(screen.getByText(/46 CMP source-cohort leads, 0 CRM CMP project memberships/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Overdue/i })).toHaveAttribute(
      "href",
      "/w/demo/activities?view=overdue",
    );
    expect(screen.getByText("Relance Genève")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Relance Genève/ })).toHaveAttribute(
      "href",
      "/w/demo/activities/a-overdue/edit",
    );
    expect(screen.getByText("Site web")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Site web/ })).toHaveAttribute(
      "href",
      expect.stringContaining("acquisition=genuine_inbound"),
    );
    expect(screen.getByRole("link", { name: /Site web/ })).toHaveAttribute(
      "href",
      expect.stringContaining("sourceId=src-web"),
    );
    expect(screen.getByText("Les Terrasses")).toBeInTheDocument();
    expect(
      screen.getByText("Active = genuine inbound lead in the last 30 days"),
    ).toBeInTheDocument();
    expect(screen.getByText(/12 leads · .+ · received/)).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("François Côté · AG-12")).toBeInTheDocument();
    expect(screen.queryByText("Live signal of leads")).not.toBeInTheDocument();
    expect(screen.queryByText("Properties by status")).not.toBeInTheDocument();
  });

  it("lets the operator switch the attention queue without inventing extra metrics", async () => {
    const user = userEvent.setup();
    render(<DashboardPanel workspaceSlug="demo" workspaceTimezone="Europe/Zurich" />);

    expect(await screen.findByText("Relance Genève")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /Today/ }));
    expect(screen.getByText("Visit Les Terrasses")).toBeInTheDocument();
    expect(screen.queryByText("Relance Genève")).not.toBeInTheDocument();
  });
});
