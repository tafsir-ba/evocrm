import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ImportDripCampaignOption } from "@/components/imports/import-drip-campaign-option";
import {
  buildImportExecutePayload,
  isImportDripCampaignEvaluationRequested,
  shouldConfirmImportDripCampaignEvaluation,
  shouldShowImportDripCampaignOption,
} from "@/lib/imports";

describe("import drip campaign opt-in", () => {
  it("lead import validate option shows drip campaign checkbox", () => {
    expect(shouldShowImportDripCampaignOption("lead")).toBe(true);

    render(
      <ImportDripCampaignOption checked={false} onChange={() => undefined} />,
    );

    expect(screen.getByText("Drip campaign enrollment")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", {
        name: "Consider imported leads for active drip campaigns",
      }),
    ).toBeInTheDocument();
  });

  it("property import validate step does not show drip campaign checkbox", () => {
    expect(shouldShowImportDripCampaignOption("property")).toBe(false);
  });

  it("when checkbox checked, execute request includes triggerAutomationForImportedLeads true", () => {
    expect(
      buildImportExecutePayload("valid_rows_only", {
        triggerAutomationForImportedLeads: true,
      }),
    ).toEqual({
      mode: "valid_rows_only",
      triggerAutomationForImportedLeads: true,
    });
  });

  it("when checkbox unchecked, execute request omits the automation flag", () => {
    expect(
      buildImportExecutePayload("valid_rows_only", {
        triggerAutomationForImportedLeads: false,
      }),
    ).toEqual({
      mode: "valid_rows_only",
    });
  });

  it("requires confirmation before executing drip evaluation imports", () => {
    expect(
      shouldConfirmImportDripCampaignEvaluation({
        entityType: "lead",
        mode: "valid_rows_only",
        triggerAutomationForImportedLeads: true,
      }),
    ).toBe(true);

    expect(
      shouldConfirmImportDripCampaignEvaluation({
        entityType: "lead",
        mode: "valid_rows_only",
        triggerAutomationForImportedLeads: false,
      }),
    ).toBe(false);

    expect(
      shouldConfirmImportDripCampaignEvaluation({
        entityType: "property",
        mode: "valid_rows_only",
        triggerAutomationForImportedLeads: true,
      }),
    ).toBe(false);
  });

  it("does not request drip evaluation for strict imports even when checked", () => {
    expect(
      isImportDripCampaignEvaluationRequested({
        entityType: "lead",
        mode: "strict",
        triggerAutomationForImportedLeads: true,
      }),
    ).toBe(false);
  });

  it("checkbox toggles checked state", async () => {
    const user = userEvent.setup();
    let checked = false;

    const { rerender } = render(
      <ImportDripCampaignOption
        checked={checked}
        onChange={(next) => {
          checked = next;
        }}
      />,
    );

    await user.click(
      screen.getByRole("checkbox", {
        name: "Consider imported leads for active drip campaigns",
      }),
    );

    rerender(
      <ImportDripCampaignOption
        checked={checked}
        onChange={(next) => {
          checked = next;
        }}
      />,
    );

    expect(checked).toBe(true);
  });
});
