"use client";

import {
  cloneElement,
  isValidElement,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

type TriggerProps = {
  onClick?: () => void;
  "aria-expanded"?: boolean;
  "aria-haspopup"?: "menu" | boolean;
};

export function Dropdown({
  trigger,
  children,
  align = "right",
}: {
  trigger: ReactElement<TriggerProps>;
  children: ReactNode;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const toggle = () => setOpen((value) => !value);

  const enhancedTrigger = isValidElement<TriggerProps>(trigger)
    ? cloneElement(trigger, {
        onClick: toggle,
        "aria-expanded": open,
        "aria-haspopup": "menu",
      })
    : trigger;

  return (
    <div className="relative">
      {enhancedTrigger}
      {open && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            role="menu"
            className={cn(
              "absolute top-[calc(100%+4px)] z-50 min-w-[180px] rounded-lg border border-[var(--color-line)] bg-white p-1.5 shadow-[var(--shadow-lg)]",
              align === "right" ? "right-0" : "left-0",
            )}
          >
            {children}
          </div>
        </>
      )}
    </div>
  );
}

export function DropdownItem({
  children,
  onClick,
  tone = "default",
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex h-8 w-full items-center rounded-md px-2.5 text-left text-[13px] hover:bg-[var(--color-muted)] focus-ring",
        tone === "danger"
          ? "text-[var(--color-danger-fg)]"
          : "text-[var(--color-ink-soft)]",
      )}
    >
      {children}
    </button>
  );
}
