import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/w/demo/leads",
}));

vi.mock("@/components/layout/workspace-shell-context", () => ({
  useWorkspaceShell: () => ({
    workspace: { slug: "demo", name: "Demo", id: "ws-1" },
  }),
}));

import { ProjectFilter } from "@/components/layout/project-filter";

describe("ProjectFilter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain("page=1");
      expect(url).toContain("pageSize=50");
      expect(url).toContain("sort=name");
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { id: "p1", name: "Grosvenor Vistas", reference: "GV" },
            { id: "p2", name: "Les Terrasses", reference: "LT-01" },
          ],
        }),
      } as Response;
    }) as typeof fetch;
  });

  it("loads a searchable page of projects instead of an unbounded list", async () => {
    const user = userEvent.setup();
    render(<ProjectFilter />);

    expect(await screen.findByRole("option", { name: /Grosvenor Vistas/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Filter by project")).toBeInTheDocument();

    const search = screen.getByLabelText("Search projects in the workspace filter");
    await user.type(search, "grosvenor");

    await waitFor(() => {
      expect(
        vi.mocked(global.fetch).mock.calls.some((call) =>
          String(call[0]).includes("search=grosvenor"),
        ),
      ).toBe(true);
    });
  });
});
