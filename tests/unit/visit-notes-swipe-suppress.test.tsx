import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SwipeToSuppressRow } from "@/components/visit-notes/swipe-to-suppress-row";
import { VisitHistoryDrawer } from "@/components/visit-notes/visit-history-drawer";

describe("SwipeToSuppressRow", () => {
  it("reveals delete on swipe left and calls onSuppress", async () => {
    const user = userEvent.setup();
    const onSuppress = vi.fn();

    render(
      <SwipeToSuppressRow onSuppress={onSuppress}>
        <button type="button">Conversation</button>
      </SwipeToSuppressRow>,
    );

    const content = screen.getByTestId("swipe-suppress-content");
    fireEvent.pointerDown(content, { clientX: 200, clientY: 40, pointerId: 1, button: 0 });
    fireEvent.pointerMove(content, { clientX: 120, clientY: 40, pointerId: 1 });
    fireEvent.pointerUp(content, { clientX: 120, clientY: 40, pointerId: 1 });

    expect(screen.getByTestId("swipe-suppress-row")).toHaveAttribute("data-open", "true");
    expect(screen.getByTestId("swipe-suppress-action")).toBeVisible();

    await user.click(screen.getByTestId("swipe-suppress-action"));
    expect(onSuppress).toHaveBeenCalledTimes(1);
  });

  it("does not open when the gesture is mostly vertical", () => {
    render(
      <SwipeToSuppressRow onSuppress={vi.fn()}>
        <button type="button">Conversation</button>
      </SwipeToSuppressRow>,
    );

    const content = screen.getByTestId("swipe-suppress-content");
    fireEvent.pointerDown(content, { clientX: 200, clientY: 20, pointerId: 1, button: 0 });
    fireEvent.pointerMove(content, { clientX: 190, clientY: 80, pointerId: 1 });
    fireEvent.pointerUp(content, { clientX: 190, clientY: 80, pointerId: 1 });

    expect(screen.getByTestId("swipe-suppress-row")).toHaveAttribute("data-open", "false");
  });
});

describe("VisitHistoryDrawer suppress", () => {
  it("wires swipe delete to onSuppress for a conversation", async () => {
    const user = userEvent.setup();
    const onSuppress = vi.fn().mockResolvedValue(undefined);

    render(
      <VisitHistoryDrawer
        open
        onClose={vi.fn()}
        onSelect={vi.fn()}
        onNew={vi.fn()}
        onSuppress={onSuppress}
        currentSessionId="s1"
        items={[
          {
            id: "s1",
            title: "QA media",
            status: "published",
            updatedAt: "2026-09-22T19:30:00.000Z",
            createdAt: "2026-09-22T19:22:00.000Z",
            leadName: "Ada Buyer",
            propertyLabel: null,
          },
        ]}
      />,
    );

    expect(screen.getByText(/swipe left on a conversation to delete/i)).toBeInTheDocument();

    const content = screen.getByTestId("swipe-suppress-content");
    fireEvent.pointerDown(content, { clientX: 220, clientY: 50, pointerId: 1, button: 0 });
    fireEvent.pointerMove(content, { clientX: 120, clientY: 50, pointerId: 1 });
    fireEvent.pointerUp(content, { clientX: 120, clientY: 50, pointerId: 1 });

    await user.click(screen.getByTestId("swipe-suppress-action"));
    expect(onSuppress).toHaveBeenCalledWith("s1");
  });
});
