import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusBadge } from "@/components/domain/status-badge";
import { TagSelector } from "@/components/domain/tag-selector";

describe("StatusBadge", () => {
  it("renders provided label and color from backend data", () => {
    render(<StatusBadge label="Won" color="#10B981" />);
    expect(screen.getByText("Won")).toBeInTheDocument();
  });

  it("supports legacy mock status prop for Phase 1 placeholders", () => {
    render(<StatusBadge status="New" />);
    expect(screen.getByText("New")).toBeInTheDocument();
  });
});

describe("TagSelector", () => {
  const tags = [
    {
      id: "t1",
      name: "Investor",
      color: "#3B82F6",
      entityTypes: ["lead"],
    },
    {
      id: "t2",
      name: "Luxury",
      color: "#8B5CF6",
      entityTypes: ["property"],
    },
  ];

  it("renders provided tags", () => {
    render(<TagSelector tags={tags} readOnly />);
    expect(screen.getByText("Investor")).toBeInTheDocument();
    expect(screen.getByText("Luxury")).toBeInTheDocument();
  });

  it("filters tags by entityType", () => {
    render(<TagSelector tags={tags} entityType="lead" readOnly />);
    expect(screen.getByText("Investor")).toBeInTheDocument();
    expect(screen.queryByText("Luxury")).not.toBeInTheDocument();
  });
});
