import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectCompanyPeople } from "@/components/projects/project-company-people";

describe("ProjectCompanyPeople", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: { lead: { id: "lead-2" } } }),
    })) as unknown as typeof fetch;
  });

  it("lists company people and associates an existing project lead", async () => {
    const onAssociated = vi.fn();
    const user = userEvent.setup();

    render(
      <ProjectCompanyPeople
        workspaceSlug="demo"
        companyName="Promotor SA"
        companyId="507f1f77bcf86cd7994390aa"
        people={[
          {
            id: "lead-1",
            companyId: "507f1f77bcf86cd7994390aa",
            projectId: "proj-1",
            fullName: "Marie Dupont",
            email: "marie@promotor.example",
          },
        ]}
        associablePeople={[
          {
            id: "lead-2",
            companyId: null,
            projectId: "proj-1",
            fullName: "Jean Client",
            email: "jean@example.com",
          },
        ]}
        canAssociate
        onAssociated={onAssociated}
      />,
    );

    expect(screen.getByText("Marie Dupont")).toBeInTheDocument();
    expect(screen.getByText(/CRM records, not free-text/i)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/Associate a person from this project/), "lead-2");
    await user.click(screen.getByRole("button", { name: "Associate" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/workspaces/demo/leads/lead-2",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ companyId: "507f1f77bcf86cd7994390aa" }),
        }),
      );
      expect(onAssociated).toHaveBeenCalled();
    });
  });
});
