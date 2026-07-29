import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DonutChart } from "@/components/domain/charts";

describe("DonutChart", () => {
  it("renders 0% instead of NaN% when total is zero", () => {
    render(
      <DonutChart
        total={0}
        data={[
          { label: "Available", value: 0, color: "#22c55e" },
          { label: "Reserved", value: 0, color: "#f59e0b" },
          { label: "Sold", value: 0, color: "#3b82f6" },
          { label: "Inactive", value: 0, color: "#94a3b8" },
        ]}
      />,
    );

    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getAllByText("0%")).toHaveLength(4);
    expect(screen.queryByText("NaN%")).not.toBeInTheDocument();
  });
});
