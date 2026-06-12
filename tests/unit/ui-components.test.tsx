import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PermissionDenied } from "@/components/ui/permission-denied";

describe("core UI components", () => {
  it("renders button variants", () => {
    render(<Button>Save lead</Button>);
    expect(screen.getByRole("button", { name: "Save lead" })).toBeInTheDocument();
  });

  it("renders empty state", () => {
    render(
      <EmptyState
        title="No leads yet"
        description="Mock empty state for Phase 1."
      />,
    );
    expect(screen.getByText("No leads yet")).toBeInTheDocument();
  });

  it("renders error state", () => {
    render(<ErrorState title="Something went wrong" />);
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("renders permission denied state", () => {
    render(<PermissionDenied title="Permission denied" />);
    expect(screen.getByText("Permission denied")).toBeInTheDocument();
  });
});
