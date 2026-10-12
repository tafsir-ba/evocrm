"use client";

import { useEffect, type RefObject } from "react";

import {
  readLeadListScroll,
  saveLeadListScroll,
} from "@/lib/lead-list-context";

function isVisibleScrollNode(node: HTMLElement): boolean {
  if (node.getClientRects().length === 0) {
    return false;
  }
  const style = window.getComputedStyle(node);
  return style.display !== "none" && style.visibility !== "hidden";
}

/**
 * Restores the lead table's own scroll position for a list URL, and keeps
 * saving it so browser Back and the in-app Back link can return to the same row.
 */
export function useLeadListScroll(
  listHref: string | null,
  refs: Array<RefObject<HTMLElement | null>>,
): void {
  useEffect(() => {
    if (!listHref) {
      return;
    }
    const top = readLeadListScroll(listHref);
    if (top == null) {
      return;
    }

    let frames = 0;
    let raf = 0;
    const apply = () => {
      for (const ref of refs) {
        const node = ref.current;
        if (node) {
          node.scrollTop = top;
        }
      }
      frames += 1;
      if (frames < 3) {
        raf = requestAnimationFrame(apply);
      }
    };
    raf = requestAnimationFrame(apply);
    return () => cancelAnimationFrame(raf);
  }, [listHref, refs]);

  useEffect(() => {
    if (!listHref) {
      return;
    }

    const saveFrom = (node: HTMLElement) => {
      if (!isVisibleScrollNode(node)) {
        return;
      }
      saveLeadListScroll(listHref, node.scrollTop);
    };

    const cleanups: Array<() => void> = [];
    for (const ref of refs) {
      const node = ref.current;
      if (!node) {
        continue;
      }
      const onScroll = () => saveFrom(node);
      const onClick = (event: Event) => {
        const target = event.target;
        if (target instanceof Element && target.closest("a")) {
          saveFrom(node);
        }
      };
      node.addEventListener("scroll", onScroll, { passive: true });
      node.addEventListener("click", onClick, true);
      cleanups.push(() => {
        saveFrom(node);
        node.removeEventListener("scroll", onScroll);
        node.removeEventListener("click", onClick, true);
      });
    }

    return () => {
      for (const cleanup of cleanups) {
        cleanup();
      }
    };
  }, [listHref, refs]);
}
