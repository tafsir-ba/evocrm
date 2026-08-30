import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CompanySelector } from "@/components/domain/company-selector";

const companies = [
  { id: "c1", name: "Promotor SA" },
  { id: "c2", name: "Lake Estates" },
];

describe("CompanySelector", () => {
  it("filters companies and keeps a searchable select", async () => {
    const user = userEvent.setup();

    render(
      <CompanySelector
        companies={companies}
        selectedCompanyId={null}
        onChange={vi.fn()}
        placeholder="Select developer / promoter…"
      />,
    );

    await user.type(screen.getByLabelText("Search companies"), "lake");

    expect(screen.getByRole("option", { name: "Lake Estates" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Promotor SA" })).not.toBeInTheDocument();
  });

  it("offers a create path when the typed name is not an existing company", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue({ id: "c3", name: "New Promotor" });
    const onChange = vi.fn();

    render(
      <CompanySelector
        companies={companies}
        selectedCompanyId={null}
        onChange={onChange}
        onCreate={onCreate}
      />,
    );

    await user.type(screen.getByLabelText("Search companies"), "New Promotor");
    await user.click(screen.getByRole("button", { name: /Create company “New Promotor”/ }));

    expect(onCreate).toHaveBeenCalledWith("New Promotor");
    expect(onChange).toHaveBeenCalledWith("c3");
  });

  it("does not offer create when the name already exists", async () => {
    const user = userEvent.setup();

    render(
      <CompanySelector
        companies={companies}
        selectedCompanyId={null}
        onChange={vi.fn()}
        onCreate={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText("Search companies"), "Promotor SA");

    expect(screen.queryByRole("button", { name: /Create company/ })).not.toBeInTheDocument();
  });
});
