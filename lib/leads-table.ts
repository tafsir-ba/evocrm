import {
  formatLeadUtmSummary,
  readLeadIntegrationAttributes,
  type LeadIntegrationUtm,
} from "@/lib/lead-integration-attributes";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

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

export function parseLeadDate(value: string | Date | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatRelativeAge(
  value: string | Date | null | undefined,
  now: Date = new Date(),
): string {
  const date = parseLeadDate(value);
  if (!date) {
    return "—";
  }

  const deltaMs = now.getTime() - date.getTime();
  const future = deltaMs < 0;
  const absMs = Math.abs(deltaMs);

  if (absMs < MINUTE_MS) {
    return future ? "in <1m" : "<1m";
  }

  const minutes = Math.round(absMs / MINUTE_MS);
  if (absMs < HOUR_MS) {
    return future ? `in ${minutes}m` : `${minutes}m`;
  }

  const hours = Math.round(absMs / HOUR_MS);
  if (absMs < DAY_MS) {
    return future ? `in ${hours}h` : `${hours}h`;
  }

  const days = Math.round(absMs / DAY_MS);
  if (days < 14) {
    return future ? `in ${days}d` : `${days}d`;
  }

  if (days < 60) {
    const weeks = Math.round(days / 7);
    return future ? `in ${weeks}w` : `${weeks}w`;
  }

  if (days < 540) {
    const months = Math.round(days / 30);
    return future ? `in ${months}mo` : `${months}mo`;
  }

  const years = Math.round(days / 365);
  return future ? `in ${years}y` : `${years}y`;
}

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

export function visibleLeadTags<T>(tags: T[], max = 2): { visible: T[]; overflow: number } {
  const safeMax = Math.max(0, max);
  if (tags.length <= safeMax) {
    return { visible: tags, overflow: 0 };
  }

  return {
    visible: tags.slice(0, safeMax),
    overflow: tags.length - safeMax,
  };
}

export function telHref(phone: string): string {
  const trimmed = phone.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  return hasPlus ? `tel:+${digits}` : `tel:${digits}`;
}

export function startOfLocalDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

export function formatNextActionWhen(
  value: string | Date | null | undefined,
  now: Date = new Date(),
): string {
  const date = parseLeadDate(value);
  if (!date) {
    return "—";
  }

  const dayDelta = Math.round(
    (startOfLocalDay(date).getTime() - startOfLocalDay(now).getTime()) / DAY_MS,
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
