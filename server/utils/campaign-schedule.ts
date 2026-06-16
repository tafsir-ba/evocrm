import "server-only";

import {
  fromDatetimeLocalInWorkspaceTimezone,
  toDatetimeLocalInWorkspaceTimezone,
} from "@/lib/workspace-datetime";

/** Minimum wait before the first (or zero-delay) step is eligible for cron pickup. */
export const IMMEDIATE_SEND_DELAY_MS = 60_000;

const SEND_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseSendTime(sendTime: string): { hour: number; minute: number } {
  const match = sendTime.match(SEND_TIME_PATTERN);

  if (!match) {
    throw new Error(`Invalid send time: ${sendTime}`);
  }

  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
  };
}

export function isValidSendTime(sendTime: string): boolean {
  return SEND_TIME_PATTERN.test(sendTime);
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function localDateInTimezone(date: Date, timeZone: string): string {
  return toDatetimeLocalInWorkspaceTimezone(date, timeZone).slice(0, 10);
}

function addCalendarDaysInTimezone(
  date: Date,
  days: number,
  timeZone: string,
): string {
  const noonLocal = `${localDateInTimezone(date, timeZone)}T12:00`;
  const noonUtc = fromDatetimeLocalInWorkspaceTimezone(noonLocal, timeZone);

  if (!noonUtc) {
    return localDateInTimezone(addDays(date, days), timeZone);
  }

  return localDateInTimezone(addDays(new Date(noonUtc), days), timeZone);
}

function scheduleAtLocalDateTime(
  localDate: string,
  sendTime: string,
  timeZone: string,
): Date | null {
  const scheduledIso = fromDatetimeLocalInWorkspaceTimezone(
    `${localDate}T${sendTime}`,
    timeZone,
  );

  return scheduledIso ? new Date(scheduledIso) : null;
}

/**
 * Schedules a step at enrolment anchor + delay days + wall-clock send time (workspace TZ).
 * Zero-delay steps send about one minute after the anchor when today's slot already passed.
 * Delayed steps roll forward to the next day when the target slot is not after the anchor.
 */
export function computeStepSendAt(
  anchor: Date,
  delayDays: number,
  sendTime: string,
  timeZone: string,
): Date {
  parseSendTime(sendTime);

  const targetDate = addCalendarDaysInTimezone(anchor, delayDays, timeZone);
  let scheduled = scheduleAtLocalDateTime(targetDate, sendTime, timeZone);

  if (!scheduled) {
    return new Date(anchor.getTime() + IMMEDIATE_SEND_DELAY_MS);
  }

  if (scheduled <= anchor) {
    if (delayDays <= 0) {
      return new Date(anchor.getTime() + IMMEDIATE_SEND_DELAY_MS);
    }

    const bumpedDate = addCalendarDaysInTimezone(scheduled, 1, timeZone);
    scheduled = scheduleAtLocalDateTime(bumpedDate, sendTime, timeZone) ?? scheduled;
  }

  if (delayDays <= 0 && scheduled.getTime() - anchor.getTime() < IMMEDIATE_SEND_DELAY_MS) {
    return new Date(anchor.getTime() + IMMEDIATE_SEND_DELAY_MS);
  }

  return scheduled;
}

export function computeNextSendAt(
  anchor: Date,
  delayDays: number,
  options?: { sendTime?: string; timeZone?: string },
): Date {
  if (options?.sendTime && options?.timeZone) {
    return computeStepSendAt(anchor, delayDays, options.sendTime, options.timeZone);
  }

  if (delayDays <= 0) {
    return new Date(anchor.getTime() + IMMEDIATE_SEND_DELAY_MS);
  }

  return addDays(anchor, delayDays);
}

export function computeRescheduledSendAt(
  anchor: Date,
  stepDelayDays: number,
  options: { overdue: boolean; sendTime?: string; timeZone?: string },
): Date {
  if (options.overdue) {
    return new Date(anchor.getTime() + IMMEDIATE_SEND_DELAY_MS);
  }

  return computeNextSendAt(anchor, stepDelayDays, {
    sendTime: options.sendTime,
    timeZone: options.timeZone,
  });
}

export function isScheduledSendDue(
  nextSendAt: Date,
  stepDelayDays: number,
  now = new Date(),
): boolean {
  if (nextSendAt <= now) {
    return true;
  }

  return stepDelayDays <= 0;
}
