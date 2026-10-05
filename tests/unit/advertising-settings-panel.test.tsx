import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdvertisingSettingsPanel } from "@/components/settings/advertising-settings-panel";
import { META_READ_ONLY_SCOPES } from "@/lib/advertising-constants";
import {
  META_CONNECT_NEVER_SHARE,
  META_CONNECT_PATH_LABELS,
} from "@/lib/advertising-meta-connect-help";

describe("AdvertisingSettingsPanel Connect Meta setup help", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ data: { connections: [] } }),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("defaults to prepare help with scopes and never-share guidance", async () => {
    render(
      <AdvertisingSettingsPanel
        workspaceSlug="evo-crm"
        canConnect
        canCreate
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("2. Connect Meta")).toBeInTheDocument();
    });

    expect(
      screen.getByRole("radio", { name: META_CONNECT_PATH_LABELS.prepare }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("radio", { name: META_CONNECT_PATH_LABELS.haveToken }),
    ).toHaveAttribute("aria-checked", "false");

    const prepare = screen.getByTestId("meta-connect-prepare-help");
    expect(prepare).toHaveTextContent(/eligible Meta app/i);
    expect(prepare).toHaveTextContent(/Generate token/i);
    expect(prepare).toHaveTextContent(/registered as a developer/i);
    expect(prepare).toHaveTextContent(META_READ_ONLY_SCOPES[0]);
    expect(prepare).toHaveTextContent(META_READ_ONLY_SCOPES[1]);
    expect(prepare).toHaveTextContent(/No write scopes/i);
    expect(prepare).toHaveTextContent(META_CONNECT_NEVER_SHARE);
    expect(screen.queryByLabelText(/Meta access token/i)).not.toBeInTheDocument();
  });

  it("switches to paste path with never-share copy and exact scopes", async () => {
    const user = userEvent.setup();
    render(
      <AdvertisingSettingsPanel
        workspaceSlug="evo-crm"
        canConnect
        canCreate
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("2. Connect Meta")).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole("button", { name: /I have a token ready/i }),
    );

    expect(
      screen.getByRole("radio", { name: META_CONNECT_PATH_LABELS.haveToken }),
    ).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByTestId("meta-connect-prepare-help")).not.toBeInTheDocument();

    const haveToken = screen.getByTestId("meta-connect-have-token");
    expect(
      within(haveToken).getByLabelText(/Meta access token/i),
    ).toBeInTheDocument();
    expect(haveToken).toHaveTextContent(META_CONNECT_NEVER_SHARE);
    expect(haveToken).toHaveTextContent(META_READ_ONLY_SCOPES[0]);
    expect(haveToken).toHaveTextContent(META_READ_ONLY_SCOPES[1]);
    expect(screen.getByRole("button", { name: "Connect Meta" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Use practice data/i })).toBeEnabled();
  });

  it("keeps practice confirm available from the prepare path", async () => {
    const user = userEvent.setup();
    render(
      <AdvertisingSettingsPanel
        workspaceSlug="evo-crm"
        canConnect
        canCreate
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("2. Connect Meta")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Use practice data/i }));
    expect(
      screen.getByText((_content, element) => {
        const value = element?.textContent ?? "";
        return (
          element?.tagName === "P" &&
          /Load\s+practice\s+Meta data/i.test(value)
        );
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Yes, use practice data/i }),
    ).toBeInTheDocument();
  });
});
