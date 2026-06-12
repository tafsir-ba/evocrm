import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Sidebar } from "@/components/layout/sidebar";
import { WorkspaceShellProvider } from "@/components/layout/workspace-shell-context";
import {
  FORBIDDEN_PRIMARY_NAV_LABELS,
  V1_NAV_ITEMS,
  buildPermissionAwareNavigation,
} from "@/lib/v1-navigation";

vi.mock("next/navigation", () => ({
  usePathname: () => "/w/demo-workspace/dashboard",
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const shellValue = {
  user: {
    id: "user-1",
    email: "user@example.com",
    name: "Demo User",
  },
  workspace: {
    id: "ws-1",
    name: "Demo Workspace",
    slug: "demo-workspace",
    timezone: "UTC",
    defaultCurrency: "USD",
    initials: "DW",
  },
  navigation: buildPermissionAwareNavigation("demo-workspace", [
    "dashboard:read",
    "opportunity:read",
    "lead:read",
    "property:read",
    "activity:read",
    "campaign:read",
    "settings:read",
  ]),
  workspaces: [
    {
      id: "ws-1",
      name: "Demo Workspace",
      slug: "demo-workspace",
      initials: "DW",
    },
  ],
};

function renderSidebar() {
  return render(
    <WorkspaceShellProvider value={shellValue}>
      <Sidebar />
    </WorkspaceShellProvider>,
  );
}

describe("app shell navigation", () => {
  it("renders only V1 primary navigation links", () => {
    renderSidebar();

    for (const item of V1_NAV_ITEMS) {
      expect(
        screen.getByRole("link", { name: item.label }),
      ).toHaveAttribute("href", `/w/demo-workspace/${item.segment}`);
    }
  });

  it("does not render forbidden primary navigation labels", () => {
    renderSidebar();

    for (const label of FORBIDDEN_PRIMARY_NAV_LABELS) {
      expect(screen.queryByRole("link", { name: label })).not.toBeInTheDocument();
    }
  });

  it("hides navigation items without permission", () => {
    render(
      <WorkspaceShellProvider
        value={{
          ...shellValue,
          navigation: buildPermissionAwareNavigation("demo-workspace", [
            "dashboard:read",
          ]),
        }}
      >
        <Sidebar />
      </WorkspaceShellProvider>,
    );

    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Leads" })).not.toBeInTheDocument();
  });
});
