export const LIST_MINUTE_MS = 60_000;
export const LIST_HOUR_MS = 60 * LIST_MINUTE_MS;
export const LIST_DAY_MS = 24 * LIST_HOUR_MS;

export function parseListDate(value: string | Date | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function startOfLocalDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

export function formatRelativeAge(
  value: string | Date | null | undefined,
  now: Date = new Date(),
): string {
  const date = parseListDate(value);
  if (!date) {
    return "—";
  }

  const deltaMs = now.getTime() - date.getTime();
  const future = deltaMs < 0;
  const absMs = Math.abs(deltaMs);

  if (absMs < LIST_MINUTE_MS) {
    return future ? "in <1m" : "<1m";
  }

  const minutes = Math.round(absMs / LIST_MINUTE_MS);
  if (absMs < LIST_HOUR_MS) {
    return future ? `in ${minutes}m` : `${minutes}m`;
  }

  const hours = Math.round(absMs / LIST_HOUR_MS);
  if (absMs < LIST_DAY_MS) {
    return future ? `in ${hours}h` : `${hours}h`;
  }

  const days = Math.round(absMs / LIST_DAY_MS);
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

export function daysSince(
  value: string | Date | null | undefined,
  now: Date = new Date(),
): number | null {
  const date = parseListDate(value);
  if (!date) {
    return null;
  }

  return (now.getTime() - date.getTime()) / LIST_DAY_MS;
}

export function visibleOverflowItems<T>(
  items: T[],
  max = 2,
): { visible: T[]; overflow: number } {
  const safeMax = Math.max(0, max);
  if (items.length <= safeMax) {
    return { visible: items, overflow: 0 };
  }

  return {
    visible: items.slice(0, safeMax),
    overflow: items.length - safeMax,
  };
}

export function formatLocation(
  ...parts: Array<string | null | undefined>
): string {
  const cleaned = parts.map((part) => part?.trim()).filter((part): part is string => Boolean(part));
  return cleaned.length > 0 ? cleaned.join(", ") : "—";
}

export function hasPositiveCount(value: number | null | undefined): boolean {
  return (value ?? 0) > 0;
}
