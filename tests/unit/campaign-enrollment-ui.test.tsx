import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildLeadEnrollmentPayload,
  buildOpportunityEnrollmentPayload,
  CampaignEnrollmentSelector,
  getActiveEnrollmentTargetIds,
  getEnrollmentSelectionError,
} from "@/components/campaigns/campaign-enrollment-selector";

describe("campaign enrollment helpers", () => {
  it("builds lead enrollment payload with lead id", () => {
    expect(buildLeadEnrollmentPayload("507f1f77bcf86cd799439011")).toEqual({
      leadId: "507f1f77bcf86cd799439011",
    });
  });

  it("builds opportunity enrollment payload with opportunity id", () => {
    expect(buildOpportunityEnrollmentPayload("507f1f77bcf86cd799439012")).toEqual({
      opportunityId: "507f1f77bcf86cd799439012",
    });
  });

  it("returns client-side error when no lead is selected", () => {
    expect(getEnrollmentSelectionError("leads", [])).toBe("Select a lead to enroll.");
  });

  it("returns client-side error when no opportunity is selected", () => {
    expect(getEnrollmentSelectionError("opportunities", [])).toBe(
      "Select an opportunity to enroll.",
    );
  });

  it("returns null when a selection exists", () => {
    expect(getEnrollmentSelectionError("leads", ["507f1f77bcf86cd799439011"])).toBeNull();
  });

  it("derives active enrollment target ids for lead campaigns", () => {
    expect(
      getActiveEnrollmentTargetIds(
        [
          {
            status: "active",
            leadId: "507f1f77bcf86cd799439011",
            opportunityId: null,
          },
          {
            status: "completed",
            leadId: "507f1f77bcf86cd799439012",
            opportunityId: null,
          },
        ],
        "leads",
      ),
    ).toEqual(["507f1f77bcf86cd799439011"]);
  });

  it("disables already-enrolled lead checkbox", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            {
              id: "507f1f77bcf86cd799439011",
              fullName: "Tafsir Ba",
              email: "tafsir@example.com",
              phone: null,
            },
          ],
        }),
      }),
    );

    render(
      <CampaignEnrollmentSelector
        workspaceSlug="demo"
        audienceType="leads"
        selectedIds={[]}
        onSelectionChange={vi.fn()}
        excludedTargetIds={["507f1f77bcf86cd799439011"]}
      />,
    );

    expect(await screen.findByText("Already enrolled in this campaign.")).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toBeDisabled();
  });
});

describe("CampaignEnrollmentSelector", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("submits lead.id from checkbox selection, not display text", async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            {
              id: "507f1f77bcf86cd799439011",
              fullName: "Tafsir Ba",
              email: "tafsir@example.com",
              phone: null,
              emailConsentStatus: "subscribed",
            },
          ],
        }),
      }),
    );

    render(
      <CampaignEnrollmentSelector
        workspaceSlug="demo"
        audienceType="leads"
        selectedIds={[]}
        onSelectionChange={onSelectionChange}
      />,
    );

    expect(await screen.findByText("Tafsir Ba")).toBeInTheDocument();

    const checkbox = screen.getByRole("checkbox");
    await user.click(checkbox);

    expect(onSelectionChange).toHaveBeenCalledWith(["507f1f77bcf86cd799439011"]);
    expect(buildLeadEnrollmentPayload("507f1f77bcf86cd799439011")).toEqual({
      leadId: "507f1f77bcf86cd799439011",
    });
    expect(buildLeadEnrollmentPayload("Tafsir Ba")).not.toEqual({
      leadId: "507f1f77bcf86cd799439011",
    });
  });

  it("submits opportunity.id from checkbox selection", async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            {
              id: "507f1f77bcf86cd799439099",
              lead: {
                id: "507f1f77bcf86cd799439011",
                fullName: "Tafsir Ba",
                email: "tafsir@example.com",
              },
              property: {
                id: "507f1f77bcf86cd799439088",
                title: "Lakeview Villa",
                reference: "LV-001",
              },
              status: { label: "Qualified" },
            },
          ],
        }),
      }),
    );

    render(
      <CampaignEnrollmentSelector
        workspaceSlug="demo"
        audienceType="opportunities"
        selectedIds={[]}
        onSelectionChange={onSelectionChange}
      />,
    );

    expect(await screen.findByText("Tafsir Ba")).toBeInTheDocument();
    expect(screen.getByText(/Lakeview Villa/)).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox"));

    expect(onSelectionChange).toHaveBeenCalledWith(["507f1f77bcf86cd799439099"]);
    expect(buildOpportunityEnrollmentPayload("507f1f77bcf86cd799439099")).toEqual({
      opportunityId: "507f1f77bcf86cd799439099",
    });
  });

  it("searches leads using workspace leads API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CampaignEnrollmentSelector
        workspaceSlug="demo"
        audienceType="leads"
        selectedIds={[]}
        onSelectionChange={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText(/Search leads/), {
      target: { value: "tafsir ba" },
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const lastCall = fetchMock.mock.calls.at(-1)?.[0] as string;
    expect(lastCall).toContain("/api/workspaces/demo/leads?");
    expect(lastCall).toContain("search=tafsir");
  });
});
