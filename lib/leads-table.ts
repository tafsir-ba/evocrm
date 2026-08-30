import {
  formatLeadUtmSummary,
  readLeadIntegrationAttributes,
  type LeadIntegrationUtm,
} from "@/lib/lead-integration-attributes";
import {
  LIST_DAY_MS,
  formatRelativeAge,
  parseListDate,
  startOfLocalDay,
} from "@/lib/list-view";

export {
  formatRelativeAge,
  parseListDate as parseLeadDate,
  startOfLocalDay,
  visibleOverflowItems as visibleLeadTags,
} from "@/lib/list-view";

export type LeadTableUser = {
  id: string;
  name: string | null;
  email: string;
};

export type LeadTableTag = {
  id: string;
  name: string;
  color: string;
};

export type LeadTableActivityEvent = {
  id: string;
  title: string;
  at: string | Date;
};

export function formatOwnerName(user: LeadTableUser | null | undefined): string {
  const name = user?.name?.trim();
  if (name) {
    return name;
  }

  const email = user?.email?.trim();
  return email || "—";
}

export function formatCompactUtm(utm: LeadIntegrationUtm | undefined): string | null {
  if (!utm) {
    return null;
  }

  const parts = [utm.campaign, utm.source, utm.medium].filter(
    (part): part is string => Boolean(part && part.trim()),
  );
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function leadUtmFromAttributes(
  attributes: Record<string, unknown> | null | undefined,
): LeadIntegrationUtm | undefined {
  return readLeadIntegrationAttributes(attributes)?.utm;
}

export function formatSourceContext(
  sourceLabel: string | null | undefined,
  attributes: Record<string, unknown> | null | undefined,
): { source: string; context: string | null } {
  const utm = leadUtmFromAttributes(attributes);
  return {
    source: sourceLabel?.trim() || "—",
    context: formatCompactUtm(utm),
  };
}

export function formatUtmTitle(
  attributes: Record<string, unknown> | null | undefined,
): string | undefined {
  const utm = leadUtmFromAttributes(attributes);
  if (!utm) {
    return undefined;
  }

  const summary = formatLeadUtmSummary(utm);
  return summary === "—" ? undefined : summary;
}

export function telHref(phone: string): string {
  const trimmed = phone.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  return hasPlus ? `tel:+${digits}` : `tel:${digits}`;
}

export function formatNextActionWhen(
  value: string | Date | null | undefined,
  now: Date = new Date(),
): string {
  const date = parseListDate(value);
  if (!date) {
    return "—";
  }

  const dayDelta = Math.round(
    (startOfLocalDay(date).getTime() - startOfLocalDay(now).getTime()) / LIST_DAY_MS,
  );

  if (dayDelta === 0) {
    return "Today";
  }
  if (dayDelta === 1) {
    return "Tomorrow";
  }
  if (dayDelta === -1) {
    return "Yesterday";
  }
  if (dayDelta < 0) {
    return `Overdue ${Math.abs(dayDelta)}d`;
  }
  if (dayDelta < 14) {
    return `in ${dayDelta}d`;
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function formatActivityLine(input: {
  lastActivity?: LeadTableActivityEvent | null;
  nextAction?: LeadTableActivityEvent | null;
  lastContactedAt?: string | Date | null;
  now?: Date;
}): { last: string | null; next: string | null } {
  const now = input.now ?? new Date();
  const lastAt = input.lastActivity?.at ?? input.lastContactedAt ?? null;
  const lastTitle = input.lastActivity?.title?.trim() || null;

  return {
    last: lastAt
      ? lastTitle
        ? `${formatRelativeAge(lastAt, now)} · ${lastTitle}`
        : formatRelativeAge(lastAt, now)
      : null,
    next: input.nextAction
      ? `${formatNextActionWhen(input.nextAction.at, now)} · ${input.nextAction.title.trim()}`
      : null,
  };
}

export function formatNextStepCell(input: {
  lastActivity?: LeadTableActivityEvent | null;
  nextAction?: LeadTableActivityEvent | null;
  lastContactedAt?: string | Date | null;
  now?: Date;
}): { text: string; kind: "next" | "last" | "empty" } {
  const now = input.now ?? new Date();
  if (input.nextAction?.title.trim()) {
    return {
      text: `${formatNextActionWhen(input.nextAction.at, now)} · ${input.nextAction.title.trim()}`,
      kind: "next",
    };
  }

  const lines = formatActivityLine(input);
  if (lines.last) {
    return { text: `Last · ${lines.last}`, kind: "last" };
  }

  return { text: "—", kind: "empty" };
}

export type LeadUrgencyLevel =
  | "overdue"
  | "today"
  | "soon"
  | "stale"
  | "unassigned"
  | "none";

export type LeadUrgency = {
  level: LeadUrgencyLevel;
  label: string | null;
  tone: "danger" | "warn" | "info" | "muted";
  sortRank: number;
};

const STALE_DAY_THRESHOLD = 7;
const SOON_DAY_THRESHOLD = 2;

export function leadUrgency(input: {
  nextAction?: LeadTableActivityEvent | null;
  lastActivity?: LeadTableActivityEvent | null;
  lastContactedAt?: string | Date | null;
  createdAt: string | Date;
  assignedUser?: { id: string } | null;
  archivedAt?: string | Date | null;
  now?: Date;
}): LeadUrgency {
  if (input.archivedAt) {
    return { level: "none", label: null, tone: "muted", sortRank: 9 };
  }

  const now = input.now ?? new Date();
  const nextAt = parseListDate(input.nextAction?.at);
  if (nextAt) {
    const dayDelta = Math.round(
      (startOfLocalDay(nextAt).getTime() - startOfLocalDay(now).getTime()) / LIST_DAY_MS,
    );
    if (dayDelta < 0) {
      return { level: "overdue", label: "Overdue", tone: "danger", sortRank: 0 };
    }
    if (dayDelta === 0) {
      return { level: "today", label: "Today", tone: "warn", sortRank: 1 };
    }
    if (dayDelta <= SOON_DAY_THRESHOLD) {
      return { level: "soon", label: "Soon", tone: "info", sortRank: 2 };
    }
  }

  const lastTouch = parseListDate(
    input.lastActivity?.at ?? input.lastContactedAt ?? input.createdAt,
  );
  if (lastTouch) {
    const ageDays = (now.getTime() - lastTouch.getTime()) / LIST_DAY_MS;
    if (ageDays >= STALE_DAY_THRESHOLD) {
      return { level: "stale", label: "Stale", tone: "warn", sortRank: 3 };
    }
  }

  if (!input.assignedUser) {
    return { level: "unassigned", label: "Unassigned", tone: "muted", sortRank: 4 };
  }

  return { level: "none", label: null, tone: "muted", sortRank: 5 };
}
