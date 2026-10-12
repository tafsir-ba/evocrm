"use client";

import { useRouter } from "next/navigation";
import { useEffect, type MouseEvent, type ReactNode } from "react";

import {
  noteWorkflowArrival,
  planWorkflowParentBack,
  planWorkflowStackBack,
} from "@/lib/workflow-navigation";

export function WorkflowArrival() {
  useEffect(() => {
    noteWorkflowArrival(`${window.location.pathname}${window.location.search}`);
  }, []);
  return null;
}

export function WorkflowBackLink({
  href,
  label,
  mode = "parent",
  className,
  children,
  fallback = "push",
  ariaLabel,
}: {
  href: string;
  label?: string;
  /** parent: one step to this href. stack: one step to the previous stored screen, or href. */
  mode?: "parent" | "stack";
  className?: string;
  children?: ReactNode;
  fallback?: "push" | "replace";
  ariaLabel?: string;
}) {
  const router = useRouter();

  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    const plan =
      mode === "stack"
        ? planWorkflowStackBack(href)
        : planWorkflowParentBack(href);
    if (plan.action === "history") {
      router.back();
      return;
    }
    if (fallback === "replace") {
      router.replace(plan.href);
      return;
    }
    router.push(plan.href);
  }

  return (
    <a
      href={href}
      className={className}
      onClick={onClick}
      aria-label={ariaLabel}
    >
      {children ?? label ?? "Back"}
    </a>
  );
}
