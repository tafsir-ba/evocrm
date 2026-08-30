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

  it("renders loading label while projects are loading", () => {
    render(<ProjectSelector projects={[]} loading />);

    expect(screen.getByText("Loading projects…")).toBeInTheDocument();
    expect(screen.queryByText("No projects available")).not.toBeInTheDocument();
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

  it("filters a long project list by name, reference, or location", async () => {
    const user = userEvent.setup();
    const many = [
      ...projects,
      { id: "p3", name: "Alpine", reference: "AL", city: "Zermatt", country: "Switzerland" },
      { id: "p4", name: "Harbour", reference: "HB", city: "Nice", country: "France" },
      { id: "p5", name: "Garden", reference: "GD", city: "Lyon", country: "France" },
      { id: "p6", name: "Court", reference: "CT", city: "Bern", country: "Switzerland" },
      { id: "p7", name: "Park", reference: "PK", city: "Basel", country: "Switzerland" },
      { id: "p8", name: "Tower", reference: "TW", city: "Zurich", country: "Switzerland" },
    ];

    render(
      <ProjectSelector
        projects={many}
        selectedProjectId={null}
        onChange={vi.fn()}
        placeholder="Select a project"
      />,
    );

    const search = screen.getByLabelText("Search projects");
    await user.type(search, "geneva");

    expect(screen.getByRole("option", { name: /Green View/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Harbour/ })).not.toBeInTheDocument();
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
