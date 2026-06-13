import type { ReactNode } from "react";

import { formatDateTimeInWorkspaceTimezone } from "@/lib/workspace-datetime";
import {
  IconCalendar,
  IconCheck,
  IconMail,
  IconMapPin,
  IconNote,
  IconPhone,
} from "@/lib/icons";

export function activityTypeIcon(key: string | undefined, size = 14): ReactNode {
  switch (key) {
    case "call":
      return <IconPhone size={size} />;
    case "email":
      return <IconMail size={size} />;
    case "meeting":
      return <IconCalendar size={size} />;
    case "visit":
      return <IconMapPin size={size} />;
    case "task":
      return <IconCheck size={size} />;
    case "note":
      return <IconNote size={size} />;
    default:
      return <IconCalendar size={size} />;
  }
}

export function formatActivityDateTime(
  value: string | Date | null | undefined,
  workspaceTimezone?: string,
): string {
  return formatDateTimeInWorkspaceTimezone(value, workspaceTimezone);
}

export function formatRelatedSummary(activity: {
  lead: { fullName: string } | null;
  property: { title: string; reference: string | null } | null;
  opportunity: { id: string } | null;
}): string {
  const parts: string[] = [];

  if (activity.lead) {
    parts.push(activity.lead.fullName);
  }
  if (activity.property) {
    parts.push(
      activity.property.reference
        ? `${activity.property.title} (${activity.property.reference})`
        : activity.property.title,
    );
  }
  if (activity.opportunity && parts.length === 0) {
    parts.push("Opportunity");
  }

  return parts.length > 0 ? parts.join(" · ") : "—";
}

export function promptOptionalActivityOutcome(action: "complete" | "cancel"): string | null {
  const label =
    action === "complete"
      ? "Outcome (optional — leave blank to skip):"
      : "Cancellation reason (optional — leave blank to skip):";
  const value = window.prompt(label);
  if (value === null) {
    return null;
  }
  return value.trim();
}

export async function completeActivityRequest(
  apiBase: string,
  activityId: string,
): Promise<{ ok: true } | { ok: false; message: string } | { ok: false; cancelled: true }> {
  const outcome = promptOptionalActivityOutcome("complete");
  if (outcome === null) {
    return { ok: false, cancelled: true };
  }

  const response = await fetch(`${apiBase}/activities/${activityId}/complete`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(outcome ? { outcome } : {}),
  });

  if (!response.ok) {
    const body = await response.json();
    return {
      ok: false,
      message: body.error?.message ?? "Failed to complete activity.",
    };
  }

  return { ok: true };
}

export async function cancelActivityRequest(
  apiBase: string,
  activityId: string,
): Promise<{ ok: true } | { ok: false; message: string } | { ok: false; cancelled: true }> {
  const outcome = promptOptionalActivityOutcome("cancel");
  if (outcome === null) {
    return { ok: false, cancelled: true };
  }

  const response = await fetch(`${apiBase}/activities/${activityId}/cancel`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(outcome ? { outcome } : {}),
  });

  if (!response.ok) {
    const body = await response.json();
    return {
      ok: false,
      message: body.error?.message ?? "Failed to cancel activity.",
    };
  }

  return { ok: true };
}
