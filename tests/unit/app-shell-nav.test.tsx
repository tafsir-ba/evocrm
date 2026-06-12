import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Sidebar } from "@/components/layout/sidebar";
import {
  FORBIDDEN_PRIMARY_NAV_LABELS,
  V1_NAV_ITEMS,
} from "@/lib/v1-navigation";

vi.mock("next/navigation", () => ({
  usePathname: () => "/w/demo-workspace/dashboard",
  useParams: () => ({ workspaceSlug: "demo-workspace" }),
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

describe("app shell navigation", () => {
  it("renders only V1 primary navigation links", () => {
    render(<Sidebar />);

    for (const item of V1_NAV_ITEMS) {
      expect(
        screen.getByRole("link", { name: item.label }),
      ).toHaveAttribute("href", `/w/demo-workspace/${item.segment}`);
    }
  });

  it("does not render forbidden primary navigation labels", () => {
    render(<Sidebar />);

    for (const label of FORBIDDEN_PRIMARY_NAV_LABELS) {
      expect(screen.queryByRole("link", { name: label })).not.toBeInTheDocument();
    }
  });
});
