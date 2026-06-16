const DEFAULT_TIMEZONE = "UTC";

function normalizeTimeZone(timeZone: string | undefined): string {
  if (!timeZone?.trim()) {
    return DEFAULT_TIMEZONE;
  }

  try {
    Intl.DateTimeFormat(undefined, { timeZone: timeZone.trim() });
    return timeZone.trim();
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

export function formatWorkspaceTimezoneLabel(timeZone: string | undefined): string {
  const zone = normalizeTimeZone(timeZone);

  try {
    const parts = new Intl.DateTimeFormat(undefined, {
      timeZone: zone,
      timeZoneName: "short",
    }).formatToParts(new Date());
    const abbreviation = parts.find((part) => part.type === "timeZoneName")?.value;

    return abbreviation ? `${zone} (${abbreviation})` : zone;
  } catch {
    return zone;
  }
}

export function formatDateTimeInWorkspaceTimezone(
  value: string | Date | null | undefined,
  timeZone: string | undefined,
): string {
  if (!value) {
    return "—";
  }

  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  const zone = normalizeTimeZone(timeZone);

  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: zone,
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

export function toDatetimeLocalInWorkspaceTimezone(
  value: string | Date | null | undefined,
  timeZone: string | undefined,
): string {
  if (!value) {
    return "";
  }

  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const zone = normalizeTimeZone(timeZone);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  const year = get("year");
  const month = get("month");
  const day = get("day");
  const hour = get("hour").padStart(2, "0");
  const minute = get("minute").padStart(2, "0");

  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export function fromDatetimeLocalInWorkspaceTimezone(
  localValue: string,
  timeZone: string | undefined,
): string | undefined {
  if (!localValue.trim()) {
    return undefined;
  }

  const match = localValue.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) {
    return undefined;
  }

  const zone = normalizeTimeZone(timeZone);
  let candidate = new Date(
    Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
    ),
  );

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const formatted = toDatetimeLocalInWorkspaceTimezone(candidate, zone);
    if (formatted === localValue) {
      return candidate.toISOString();
    }

    const formattedMatch = formatted.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (!formattedMatch) {
      break;
    }

    const formattedAsUtc = Date.UTC(
      Number(formattedMatch[1]),
      Number(formattedMatch[2]) - 1,
      Number(formattedMatch[3]),
      Number(formattedMatch[4]),
      Number(formattedMatch[5]),
    );
    const targetAsUtc = Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
    );

    candidate = new Date(candidate.getTime() + (targetAsUtc - formattedAsUtc));
  }

  return candidate.toISOString();
}
