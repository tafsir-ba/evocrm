import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/w/demo/projects",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/layout/topbar", () => ({
  Topbar: () => <div>topbar</div>,
}));

vi.mock("@/components/layout/sidebar", () => ({
  Sidebar: () => <aside>sidebar</aside>,
}));

vi.mock("@/components/layout/mobile-nav", () => ({
  MobileNav: () => null,
}));

import { AppShell } from "@/components/layout/app-shell";
import { WorkspaceShellProvider } from "@/components/layout/workspace-shell-context";
import { FeedbackWidget } from "@/components/feedback/feedback-widget";

const shellValue = {
  user: { id: "user-1", email: "user@example.com", name: "Demo User" },
  workspace: {
    id: "ws-1",
    name: "Demo Workspace",
    slug: "demo",
    timezone: "UTC",
    defaultCurrency: "USD",
    initials: "DW",
  },
  navigation: [],
  workspaces: [{ id: "ws-1", name: "Demo Workspace", slug: "demo", initials: "DW" }],
};

describe("feedback dock layout", () => {
  it("docks the trigger in document flow instead of a fixed overlay", () => {
    render(
      <WorkspaceShellProvider value={shellValue}>
        <FeedbackWidget />
      </WorkspaceShellProvider>,
    );

    const dock = screen.getByTestId("feedback-dock");
    const trigger = screen.getByTestId("feedback-trigger");

    expect(dock.tagName).toBe("FOOTER");
    expect(dock).toContainElement(trigger);
    expect(trigger.className).not.toMatch(/\bfixed\b/);
    expect(dock.className).not.toMatch(/\bfixed\b/);
    expect(dock.className).toMatch(/shrink-0/);
  });

  it("reserves the dock outside the scrollable workspace main", () => {
    render(
      <WorkspaceShellProvider value={shellValue}>
        <AppShell>
          <div>
            <table>
              <tbody>
                <tr>
                  <td>Project row</td>
                </tr>
              </tbody>
            </table>
            <button type="button" aria-label="Next page">
              Next
            </button>
          </div>
        </AppShell>
      </WorkspaceShellProvider>,
    );

    const main = screen.getByTestId("workspace-main");
    const dock = screen.getByTestId("feedback-dock");
    const next = screen.getByRole("button", { name: "Next page" });

    expect(main).toHaveClass("overflow-auto");
    expect(main.contains(next)).toBe(true);
    expect(main.contains(dock)).toBe(false);
    expect(dock.contains(screen.getByTestId("feedback-trigger"))).toBe(true);
  });

  it("opens the feedback modal from the dock without covering page chrome", async () => {
    const user = userEvent.setup();

    render(
      <WorkspaceShellProvider value={shellValue}>
        <AppShell>
          <p>Projects table</p>
        </AppShell>
      </WorkspaceShellProvider>,
    );

    await user.click(screen.getByTestId("feedback-trigger"));

    expect(screen.getByRole("dialog", { name: "Send feedback" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send feedback" }).closest(".overflow-y-auto")).toBeNull();
    expect(screen.getByTestId("feedback-dock")).toBeInTheDocument();
  });
});
