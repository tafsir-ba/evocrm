import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProjectsPanel } from "@/components/settings/projects-panel";

describe("ProjectsPanel", () => {
  it("renders empty state when no projects exist", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: { projects: [] } }),
      }),
    );

    render(<ProjectsPanel workspaceSlug="demo" canUpdate={true} />);

    expect(await screen.findByText("No projects yet")).toBeInTheDocument();
  });

  it("renders create form when user can update", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: { projects: [] } }),
      }),
    );

    render(<ProjectsPanel workspaceSlug="demo" canUpdate={true} />);

    expect(await screen.findByRole("link", { name: "+ Create project" })).toHaveAttribute(
      "href",
      "/w/demo/projects/new",
    );
  });
});
