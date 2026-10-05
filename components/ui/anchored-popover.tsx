"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

type Position = { left: number; top?: number; bottom?: number };

const VIEWPORT_MARGIN = 8;
const PREFERRED_SPACE_BELOW = 300;

function clampWidth(width: number): number {
  return Math.min(width, window.innerWidth - VIEWPORT_MARGIN * 2);
}

function computePosition(anchor: HTMLElement, width: number, align: "left" | "right"): Position {
  const rect = anchor.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const visibleHeight = window.visualViewport?.height ?? window.innerHeight;
  const rawLeft = align === "left" ? rect.left : rect.right - width;
  const left = Math.max(
    VIEWPORT_MARGIN,
    Math.min(rawLeft, viewportWidth - width - VIEWPORT_MARGIN),
  );
  const spaceBelow = visibleHeight - rect.bottom;
  const spaceAbove = rect.top;

  if (spaceBelow < PREFERRED_SPACE_BELOW && spaceAbove > spaceBelow) {
    return { left, bottom: window.innerHeight - rect.top + 4 };
  }
  return { left, top: rect.bottom + 4 };
}

/**
 * Popover rendered in a portal with fixed positioning so it is not clipped by scrolling tables.
 * Closes on Escape and outside pointer down. Resizes and scrolls re-anchor it instead of closing,
 * because mobile keyboards resize/scroll the viewport as soon as a field inside is focused.
 */
export function AnchoredPopover({
  open,
  anchorRef,
  onClose,
  children,
  label,
  width = 240,
  align = "left",
  className,
}: {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
  label: string;
  width?: number;
  align?: "left" | "right";
  className?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) {
      setPosition(null);
      return;
    }
    setPosition(computePosition(anchorRef.current, clampWidth(width), align));
  }, [open, anchorRef, width, align]);

  useEffect(() => {
    if (!open) return;

    const isInside = (target: EventTarget | null) =>
      target instanceof Node &&
      (panelRef.current?.contains(target) || anchorRef.current?.contains(target));

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!isInside(event.target)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const reposition = (event?: Event) => {
      if (event?.target instanceof Node && panelRef.current?.contains(event.target)) return;
      if (anchorRef.current) {
        setPosition(computePosition(anchorRef.current, clampWidth(width), align));
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    window.visualViewport?.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
      window.visualViewport?.removeEventListener("resize", reposition);
    };
  }, [open, onClose, anchorRef, width, align]);

  if (!open || !mounted || !position) return null;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={label}
      className={cn(
        "fixed z-50 rounded-lg border border-[var(--color-line)] bg-white p-1.5 shadow-[var(--shadow-lg)]",
        className,
      )}
      style={{ width: `min(${width}px, calc(100vw - ${VIEWPORT_MARGIN * 2}px))`, ...position }}
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}
