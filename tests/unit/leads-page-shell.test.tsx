import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const projectFilterState = vi.hoisted(() => ({ current: null as string | null }));

vi.mock("@/lib/use-workspace-project-filter", () => ({
  useWorkspaceProjectFilter: () => projectFilterState.current,
}));

vi.mock("@/components/leads/leads-panel", () => ({
  LeadsPanel: () => <div data-testid="leads-panel" />,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/w/demo/leads",
}));

import { LeadsPageShell } from "@/components/leads/leads-page-shell";

describe("LeadsPageShell", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    projectFilterState.current = null;
  });

  it("shows project section nav while the project header is still loading", async () => {
    projectFilterState.current = "507f1f77bcf86cd799439051";
    let resolveFetch: ((value: Response) => void) | undefined;
    global.fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    ) as typeof fetch;

    render(
      <LeadsPageShell
        workspaceSlug="demo"
        canCreate
        canArchive
        canDelete
        canUpdate
      />,
    );

    expect(screen.getByRole("heading", { name: "Project" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Project sections" })).toBeInTheDocument();
    expect(screen.getByText("Leads")).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("leads-panel")).toBeInTheDocument();

    resolveFetch?.(
      {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            project: {
              id: "507f1f77bcf86cd799439051",
              name: "Les Terrasses",
              reference: "LT-01",
            },
          },
        }),
      } as Response,
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Les Terrasses" })).toBeInTheDocument();
    });
  });

  it("keeps project section nav when project fetch fails", async () => {
    projectFilterState.current = "507f1f77bcf86cd799439051";
    global.fetch = vi.fn(async () =>
      ({
        ok: false,
        status: 404,
        json: async () => ({ error: { message: "Not found" } }),
      }) as Response,
    ) as typeof fetch;

    render(
      <LeadsPageShell
        workspaceSlug="demo"
        canCreate
        canArchive
        canDelete
        canUpdate
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Project" })).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByText("Leads")).toHaveAttribute("aria-current", "page");
  });
});
