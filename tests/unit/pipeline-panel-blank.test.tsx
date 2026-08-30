import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams("projectId=p1"),
  usePathname: () => "/w/demo/pipeline",
}));

vi.mock("@/lib/use-workspace-project-filter", () => ({
  useWorkspaceProjectFilter: () => "p1",
}));

import { PipelinePanel } from "@/components/opportunities/pipeline-panel";

function mockFetch(pipelineData: unknown, membersData: unknown = { members: [] }) {
  global.fetch = vi.fn(async (input: RequestInfo) => {
    const url = String(input);
    if (url.includes("/pipeline")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: pipelineData }),
      } as Response;
    }
    if (url.includes("/members")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: membersData }),
      } as Response;
    }
    if (url.includes("/dictionary-items")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { items: [] } }),
      } as Response;
    }
    return { ok: false, status: 404, json: async () => ({}) } as Response;
  }) as typeof fetch;
}

const emptyPipeline = {
  columns: [
    {
      status: { id: "s1", label: "Qualified", key: "q", color: "#000", order: 1 },
      count: 0,
      valueTotal: 0,
      opportunities: [],
    },
  ],
  totals: { count: 0, activeValue: 0 },
};

describe("PipelinePanel blank regressions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders stage columns for an empty pipeline", async () => {
    mockFetch(emptyPipeline);
    render(<PipelinePanel workspaceSlug="demo" defaultCurrency="CHF" canCreate canUpdate />);
    await waitFor(() => {
      expect(screen.getByText("Qualified")).toBeInTheDocument();
      expect(screen.getByText("No opportunities")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "Column actions" })).not.toBeInTheDocument();
    expect(screen.queryByText("Add card")).not.toBeInTheDocument();
  });

  it("survives members payload without members array", async () => {
    mockFetch(emptyPipeline, {});
    render(<PipelinePanel workspaceSlug="demo" defaultCurrency="CHF" canCreate canUpdate />);
    await waitFor(() => {
      expect(screen.getByText("Qualified")).toBeInTheDocument();
    });
  });

  it("renders opportunity with nullish assignee email", async () => {
    mockFetch({
      columns: [
        {
          status: {
            id: "s1",
            label: "Qualified",
            key: "q",
            color: "#000",
            order: 1,
            behavior: "open",
          },
          count: 1,
          valueTotal: 1000,
          opportunities: [
            {
              id: "o1",
              value: null,
              currency: "CHF",
              probability: null,
              statusId: "s1",
              lead: { id: "l1", fullName: "Ada Lovelace" },
              property: { id: "pr1", title: "Unit A", reference: null },
              assignedUser: { id: "u1", name: null, email: null },
            },
          ],
        },
      ],
      totals: { count: 1, activeValue: 0 },
    });

    render(<PipelinePanel workspaceSlug="demo" defaultCurrency="CHF" canCreate canUpdate />);
    await waitFor(() => {
      expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
      expect(screen.getByText("Unit A")).toBeInTheDocument();
    });
  });
});
