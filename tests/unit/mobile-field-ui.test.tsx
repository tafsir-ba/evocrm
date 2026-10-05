import { act, fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { describe, expect, it } from "vitest";

import { LeadContactActions } from "@/components/leads/lead-contact-actions";
import { AnchoredPopover } from "@/components/ui/anchored-popover";

describe("LeadContactActions", () => {
  it("offers call, WhatsApp and email for an international number", () => {
    render(<LeadContactActions phone="+33 6 12 34 56 78" email="jane@example.com" />);
    const group = screen.getByRole("group", { name: "Contact lead" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /call/i })).toHaveAttribute("href", "tel:+33612345678");
    expect(screen.getByRole("link", { name: /whatsapp/i })).toHaveAttribute(
      "href",
      "https://wa.me/33612345678",
    );
    expect(screen.getByRole("link", { name: /email/i })).toHaveAttribute(
      "href",
      "mailto:jane@example.com",
    );
  });

  it("hides WhatsApp for local numbers and renders nothing without contact details", () => {
    const { rerender, container } = render(<LeadContactActions phone="06 12 34 56 78" />);
    expect(screen.getByRole("link", { name: /call/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /whatsapp/i })).not.toBeInTheDocument();

    rerender(<LeadContactActions phone={null} email={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

function PopoverHarness() {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(true);
  return (
    <>
      <button ref={anchorRef} type="button">
        Anchor
      </button>
      <AnchoredPopover open={open} anchorRef={anchorRef} onClose={() => setOpen(false)} label="Test popover">
        <input aria-label="Inside" />
      </AnchoredPopover>
    </>
  );
}

describe("AnchoredPopover on mobile", () => {
  it("stays open when the viewport resizes or scrolls (on-screen keyboard)", () => {
    render(<PopoverHarness />);
    expect(screen.getByRole("dialog", { name: "Test popover" })).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event("resize"));
      window.dispatchEvent(new Event("scroll"));
    });

    expect(screen.getByRole("dialog", { name: "Test popover" })).toBeInTheDocument();
  });

  it("closes on outside touch and Escape", () => {
    render(<PopoverHarness />);
    fireEvent.touchStart(document.body);
    expect(screen.queryByRole("dialog", { name: "Test popover" })).not.toBeInTheDocument();
  });
});
