import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

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
