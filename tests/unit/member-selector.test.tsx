import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MemberSelector } from "@/components/domain/member-selector";

describe("MemberSelector", () => {
  it("renders unassigned option and member labels", () => {
    render(
      <MemberSelector
        members={[
          { userId: "user-1", name: "Jane Agent", email: "jane@example.com" },
        ]}
        selectedUserId={null}
        onChange={() => undefined}
      />,
    );

    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByText("Unassigned")).toBeInTheDocument();
    expect(screen.getByText("Jane Agent (jane@example.com)")).toBeInTheDocument();
  });

  it("calls onChange with selected user id", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <MemberSelector
        members={[
          { userId: "user-1", name: "Jane Agent", email: "jane@example.com" },
        ]}
        selectedUserId={null}
        onChange={onChange}
      />,
    );

    await user.selectOptions(screen.getByRole("combobox"), "user-1");

    expect(onChange).toHaveBeenCalledWith("user-1");
  });
});
