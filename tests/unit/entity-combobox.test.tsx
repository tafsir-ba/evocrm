import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EntityCombobox } from "@/components/domain/entity-combobox";

describe("EntityCombobox", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("searches asynchronously and can select beyond a single page of results", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onSearch = vi.fn(async (query: string) => {
      if (query.includes("zeta")) {
        return {
          options: [
            {
              id: "lead-101",
              label: "Zeta Beyond Hundred",
              meta: "zeta@example.com",
              projectId: "proj-1",
              projectName: "Alpha",
            },
          ],
          total: 101,
        };
      }
      return {
        options: Array.from({ length: 50 }, (_, index) => ({
          id: `lead-${index + 1}`,
          label: `Lead ${index + 1}`,
          projectId: "proj-1",
          projectName: "Alpha",
        })),
        total: 120,
      };
    });

    render(
      <EntityCombobox
        value=""
        onChange={onChange}
        onSearch={onSearch}
        placeholder="Search leads…"
        aria-label="Lead"
      />,
    );

    const input = screen.getByRole("combobox", { name: "Lead" });
    await user.click(input);

    await waitFor(() => {
      expect(onSearch).toHaveBeenCalled();
    });

    expect(await screen.findByText("Showing 50 of 120. Refine your search for more.")).toBeInTheDocument();

    await user.type(input, "zeta");

    expect(await screen.findByRole("option", { name: /Zeta Beyond Hundred/ })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: /Zeta Beyond Hundred/ }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "lead-101",
        label: "Zeta Beyond Hundred",
      }),
    );
  });

  it("shows empty message when search returns no matches", async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn(async () => ({ options: [], total: 0 }));

    render(
      <EntityCombobox
        value=""
        onChange={vi.fn()}
        onSearch={onSearch}
        emptyMessage="No properties in this project."
        aria-label="Property"
      />,
    );

    await user.click(screen.getByRole("combobox", { name: "Property" }));
    expect(await screen.findByText("No properties in this project.")).toBeInTheDocument();
  });
});
