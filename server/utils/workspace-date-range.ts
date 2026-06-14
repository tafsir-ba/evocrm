import "server-only";

import { fromDatetimeLocalInWorkspaceTimezone } from "@/lib/workspace-datetime";

const DEFAULT_RANGE_DAYS = 30;

function normalizeTimeZone(timeZone: string | undefined): string {
  if (!timeZone?.trim()) {
    return "UTC";
  }

  try {
    Intl.DateTimeFormat(undefined, { timeZone: timeZone.trim() });
    return timeZone.trim();
  } catch {
    return "UTC";
  }
}

export type DashboardDateRange = {
  from: Date;
  to: Date;
  timezone: string;
};

export function getDefaultDashboardDateRange(
  now: Date = new Date(),
  timezone = "UTC",
): DashboardDateRange {
  return resolvePeriodDateRange(DEFAULT_RANGE_DAYS, timezone, now);
}

export function resolvePeriodDateRange(
  periodDays: number,
  timezone: string,
  now: Date = new Date(),
): DashboardDateRange {
  const zone = normalizeTimeZone(timezone);
  const to = now;
  const from = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);

  return {
    from,
    to,
    timezone: zone,
  };
}

export function resolveDashboardDateRange(
  input: {
    dateFrom?: Date;
    dateTo?: Date;
    periodDays?: number;
    timezone?: string;
  },
  workspaceTimezone: string,
  now: Date = new Date(),
): DashboardDateRange {
  const timezone = normalizeTimeZone(input.timezone ?? workspaceTimezone);

  if (input.dateFrom && input.dateTo) {
    return {
      from: input.dateFrom,
      to: input.dateTo,
      timezone,
    };
  }

  if (input.periodDays) {
    return resolvePeriodDateRange(input.periodDays, timezone, now);
  }

  return getDefaultDashboardDateRange(now, timezone);
}

function getDatePartsInTimezone(
  date: Date,
  timezone: string,
): { year: string; month: string; day: string } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);

  return {
    year: parts.find((part) => part.type === "year")?.value ?? "1970",
    month: parts.find((part) => part.type === "month")?.value ?? "01",
    day: parts.find((part) => part.type === "day")?.value ?? "01",
  };
}

export function getDayBoundsInTimezone(
  timezone: string,
  referenceDate: Date = new Date(),
): { start: Date; end: Date } {
  const zone = normalizeTimeZone(timezone);
  const { year, month, day } = getDatePartsInTimezone(referenceDate, zone);
  const dateKey = `${year}-${month}-${day}`;

  const startIso = fromDatetimeLocalInWorkspaceTimezone(`${dateKey}T00:00`, zone);
  const endIso = fromDatetimeLocalInWorkspaceTimezone(`${dateKey}T23:59`, zone);

  const start = startIso ? new Date(startIso) : referenceDate;
  const end = endIso ? new Date(endIso) : referenceDate;

  if (end.getTime() <= start.getTime()) {
    end.setMinutes(end.getMinutes() + 1);
  }

  return { start, end };
}
