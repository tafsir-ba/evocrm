import "server-only";

import {
  fromDatetimeLocalInWorkspaceTimezone,
  toDatetimeLocalInWorkspaceTimezone,
} from "@/lib/workspace-datetime";

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
 * Schedules a step at anchor + delay days + wall-clock send time (workspace TZ).
 *
 * Contract:
 * - When the target slot is still ahead of the anchor, return that exact datetime.
 * - When the slot already passed and delayDays > 0, roll to the next calendar day.
 * - When the slot already passed and delayDays <= 0, return the exact configured slot
 *   (the order time). Cron picks it up as soon as now >= order time.
 *
 * Late activate/resume after the order time is handled separately via
 * computeRescheduledSendAt({ overdue: true }) which returns the pickup anchor (now).
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
    return new Date(anchor);
  }

  if (scheduled <= anchor) {
    if (delayDays <= 0) {
      return scheduled;
    }

    const bumpedDate = addCalendarDaysInTimezone(scheduled, 1, timeZone);
    scheduled = scheduleAtLocalDateTime(bumpedDate, sendTime, timeZone) ?? scheduled;
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
    return new Date(anchor);
  }

  return addDays(anchor, delayDays);
}

export function computeRescheduledSendAt(
  anchor: Date,
  stepDelayDays: number,
  options: { overdue: boolean; sendTime?: string; timeZone?: string },
): Date {
  if (options.overdue) {
    return anchor;
  }

  return computeNextSendAt(anchor, stepDelayDays, {
    sendTime: options.sendTime,
    timeZone: options.timeZone,
  });
}

export function isScheduledSendDue(nextSendAt: Date, now = new Date()): boolean {
  return nextSendAt <= now;
}

export function isCampaignOrderOverdue(
  scheduleAnchor: Date,
  pickupAnchor: Date,
  stepDelayDays: number,
  options: { sendTime?: string; timeZone?: string },
): boolean {
  const orderTime = computeNextSendAt(scheduleAnchor, stepDelayDays, options);
  return orderTime <= pickupAnchor;
}
