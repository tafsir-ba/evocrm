import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => "/w/demo/projects/507f1f77bcf86cd7994390dd/leads",
  useSearchParams: () => new URLSearchParams(),
}));

import {
  ProjectSectionNav,
  projectSectionTabHref,
} from "@/components/projects/project-section-nav";

describe("ProjectSectionNav", () => {
  it("marks the active tab and links Leads to the project-scoped route", () => {
    render(
      <ProjectSectionNav
        workspaceSlug="demo"
        projectId="507f1f77bcf86cd7994390dd"
        projectName="Satigny duplex"
        projectReference="satigny_duplex"
        activeTab="leads"
      />,
    );

    expect(screen.getByText("Satigny duplex")).toBeInTheDocument();
    expect(screen.getByText("Reference satigny_duplex")).toBeInTheDocument();
    expect(screen.getByText("Leads")).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute(
      "href",
      "/w/demo/projects/507f1f77bcf86cd7994390dd",
    );
    expect(screen.queryByRole("link", { name: "Leads" })).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Project sections" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.getByRole("link", { name: "Back to project" }),
    ).toHaveAttribute("href", "/w/demo/projects/507f1f77bcf86cd7994390dd");
  });

  it("opens project sections and keeps settings, share, and reference there", async () => {
    const user = userEvent.setup();
    render(
      <ProjectSectionNav
        workspaceSlug="demo"
        projectId="507f1f77bcf86cd7994390dd"
        projectName="Satigny duplex"
        projectReference="satigny_duplex"
        activeTab="leads"
        actions={<button type="button">Edit</button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Project sections" }));

    const dialog = screen.getByRole("dialog", { name: "Project sections" });
    expect(dialog).toHaveTextContent("Reference satigny_duplex");
    expect(dialog).toHaveTextContent("Settings");
    expect(dialog).toHaveTextContent("Share");
    expect(dialog).toHaveTextContent("Edit");
  });

  it("builds project-scoped leads hrefs", () => {
    expect(
      projectSectionTabHref("demo", "507f1f77bcf86cd7994390dd", {
        key: "leads",
        href: "leads",
      }),
    ).toBe("/w/demo/projects/507f1f77bcf86cd7994390dd/leads");
  });
});
