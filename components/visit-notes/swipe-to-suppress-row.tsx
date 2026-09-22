"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { IconTrash } from "@/lib/icons";
import { cn } from "@/lib/utils";

const ACTION_WIDTH = 76;
const OPEN_THRESHOLD = 40;

/**
 * iOS Mail-style swipe: drag left to reveal a trash action.
 * Pointer-based so it works with touch and mouse.
 */
export function SwipeToSuppressRow({
  children,
  onSuppress,
  suppressing,
  disabled,
  className,
}: {
  children: ReactNode;
  onSuppress: () => void;
  suppressing?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const startOffsetRef = useRef(0);
  const axisLockRef = useRef<"x" | "y" | null>(null);
  const offsetRef = useRef(0);
  const labelId = useId();
  const open = offset <= -OPEN_THRESHOLD;

  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  const close = useCallback(() => setOffset(0), []);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || suppressing) return;
    if (event.button !== 0 && event.pointerType === "mouse") return;
    startXRef.current = event.clientX;
    startYRef.current = event.clientY;
    startOffsetRef.current = offsetRef.current;
    axisLockRef.current = null;
    setDragging(true);
    if (typeof event.currentTarget.setPointerCapture === "function") {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const dx = event.clientX - startXRef.current;
    const dy = event.clientY - startYRef.current;

    if (!axisLockRef.current) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      axisLockRef.current = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
      if (axisLockRef.current === "y") {
        setDragging(false);
        if (typeof event.currentTarget.releasePointerCapture === "function") {
          try {
            event.currentTarget.releasePointerCapture(event.pointerId);
          } catch {
            // ignore
          }
        }
        return;
      }
    }

    if (axisLockRef.current !== "x") return;
    event.preventDefault();
    const next = Math.min(0, Math.max(-ACTION_WIDTH, startOffsetRef.current + dx));
    setOffset(next);
  };

  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDragging(false);
    if (typeof event.currentTarget.releasePointerCapture === "function") {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // ignore
      }
    }
    if (axisLockRef.current === "y") {
      axisLockRef.current = null;
      return;
    }
    axisLockRef.current = null;
    const current = offsetRef.current;
    setOffset(current <= -OPEN_THRESHOLD ? -ACTION_WIDTH : 0);
  };

  return (
    <div
      className={cn("relative overflow-hidden rounded-xl", className)}
      data-testid="swipe-suppress-row"
      data-open={open ? "true" : "false"}
    >
      <div
        className="absolute inset-y-0 right-0 flex w-[76px] items-stretch"
        aria-hidden={!open && offset === 0}
      >
        <button
          type="button"
          className="flex w-full flex-col items-center justify-center gap-1 bg-[var(--color-danger-fg)] text-white touch-manipulation disabled:opacity-60"
          aria-labelledby={labelId}
          data-testid="swipe-suppress-action"
          disabled={disabled || suppressing}
          onClick={(event) => {
            event.stopPropagation();
            onSuppress();
            close();
          }}
        >
          <IconTrash className="h-5 w-5" />
          <span id={labelId} className="text-[11px] font-medium">
            {suppressing ? "…" : "Delete"}
          </span>
        </button>
      </div>

      <div
        className={cn(
          "relative z-[1] bg-[var(--color-surface)] touch-pan-y",
          !dragging && "transition-transform duration-200 ease-out",
        )}
        style={{ transform: `translate3d(${offset}px, 0, 0)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        data-testid="swipe-suppress-content"
      >
        {children}
        {open && (
          <button
            type="button"
            aria-label="Close delete action"
            className="absolute inset-0 z-[2] cursor-default"
            data-testid="swipe-suppress-close-overlay"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              close();
            }}
          />
        )}
      </div>
    </div>
  );
}
