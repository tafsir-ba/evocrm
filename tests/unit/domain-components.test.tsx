import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { KanbanColumn } from "@/components/domain/kanban-column";
import { KanbanCard } from "@/components/domain/kanban-card";
import { Timeline } from "@/components/domain/timeline";

describe("domain display components", () => {
  it("renders kanban column from props", () => {
    render(
      <KanbanColumn
        title="Qualified"
        count={2}
        cards={[
          {
            id: "1",
            title: "Anna Keller",
            subtitle: "Lake Residences",
          },
        ]}
        renderCard={(card) => <KanbanCard title={card.title} subtitle={card.subtitle} />}
      />,
    );

    expect(screen.getByText("Qualified")).toBeInTheDocument();
    expect(screen.getByText("Anna Keller")).toBeInTheDocument();
  });

  it("renders timeline items from props", () => {
    render(
      <Timeline
        items={[
          { id: "a1", title: "Call back", subtitle: "Tomorrow · John Doe" },
          { id: "a2", title: "Send brochure", subtitle: "Friday · Jane Roe" },
        ]}
      />,
    );

    expect(screen.getByText("Call back")).toBeInTheDocument();
    expect(screen.getByText("Send brochure")).toBeInTheDocument();
  });
});
