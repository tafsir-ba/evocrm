import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ProjectSelector } from "@/components/domain/project-selector";

describe("ProjectSelector", () => {
  const projects = [
    { id: "p1", name: "Green View", reference: "GV", city: "Geneva", country: "Switzerland" },
    { id: "p2", name: "Lake Side", reference: null, city: "Lausanne", country: "Switzerland" },
  ];

  it("renders empty state when no projects are provided", () => {
    render(<ProjectSelector projects={[]} />);

    expect(screen.getByText("No projects available")).toBeInTheDocument();
  });

  it("renders placeholder when no project is selected", () => {
    render(
      <ProjectSelector
        projects={projects}
        selectedProjectId={null}
        onChange={vi.fn()}
        placeholder="Select a project"
      />,
    );

    expect(screen.getByRole("combobox")).toHaveDisplayValue("Select a project");
  });

  it("does not fetch data directly", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    render(
      <ProjectSelector
        projects={projects}
        selectedProjectId="p1"
        onChange={vi.fn()}
      />,
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("calls onChange when a project is selected", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <ProjectSelector
        projects={projects}
        selectedProjectId={null}
        onChange={onChange}
      />,
    );

    await user.selectOptions(screen.getByRole("combobox"), "p1");

    expect(onChange).toHaveBeenCalledWith("p1");
  });
});
