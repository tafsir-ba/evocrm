import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LeadProjectMemberships } from "@/components/leads/lead-project-memberships";

const memberships = [
  {
    id: "mem-1",
    projectId: "p1",
    isPrimary: true,
    sourceOrder: 0,
    project: { id: "p1", name: "Les Terrasses", reference: "LT-01" },
  },
  {
    id: "mem-2",
    projectId: "p2",
    isPrimary: false,
    sourceOrder: 1,
    project: { id: "p2", name: "Jardin des Nations", reference: "JDN" },
  },
];

describe("LeadProjectMemberships UI", () => {
  it("shows a compact primary plus secondary count", () => {
    render(<LeadProjectMemberships memberships={memberships} compact />);

    expect(screen.getByText("Les Terrasses")).toBeInTheDocument();
    expect(screen.getByText("+1")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Set primary" })).not.toBeInTheDocument();
  });

  it("lets authorised users add, promote, remove, and reorder", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    const onRemove = vi.fn();
    const onSetPrimary = vi.fn();
    const onReorder = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <LeadProjectMemberships
        memberships={memberships}
        canUpdate
        projects={[
          { id: "p3", name: "Alcove", reference: "ALC" },
          { id: "p1", name: "Les Terrasses", reference: "LT-01" },
        ]}
        onAdd={onAdd}
        onRemove={onRemove}
        onSetPrimary={onSetPrimary}
        onReorder={onReorder}
      />,
    );

    expect(screen.getByText(/Primary · Les Terrasses/)).toBeInTheDocument();
    expect(screen.getAllByText("Jardin des Nations (JDN)").length).toBeGreaterThan(0);

    await user.selectOptions(screen.getByLabelText("Add project membership"), "p3");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(onAdd).toHaveBeenCalledWith("p3", false);

    await user.click(screen.getByRole("button", { name: "Set primary" }));
    expect(onSetPrimary).toHaveBeenCalledWith("mem-2");

    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(onRemove).toHaveBeenCalledWith("mem-2");

    await user.click(screen.getAllByRole("button", { name: "Down" })[0]!);
    expect(onReorder).toHaveBeenCalledWith(["mem-2", "mem-1"]);
  });

  it("hides mutation controls without update permission", () => {
    render(<LeadProjectMemberships memberships={memberships} canUpdate={false} />);

    expect(screen.queryByLabelText("Add project membership")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Set primary" })).not.toBeInTheDocument();
  });
});
