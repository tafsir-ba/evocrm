import "server-only";

import type { DictionaryItemRecord } from "@/server/repositories/dictionary-items";
import {
  isActivityCancelledBehavior,
  isActivityCompletedBehavior,
  isActivityPendingBehavior,
} from "@/server/services/dictionary-items";

export type ActivityStatusBehaviorSideEffects = {
  completedAt: Date | null;
  cancelledAt: Date | null;
};

export function applyActivityStatusBehavior(
  status: Pick<DictionaryItemRecord, "behavior">,
  now: Date = new Date(),
): ActivityStatusBehaviorSideEffects {
  if (isActivityCompletedBehavior(status.behavior)) {
    return {
      completedAt: now,
      cancelledAt: null,
    };
  }

  if (isActivityCancelledBehavior(status.behavior)) {
    return {
      completedAt: null,
      cancelledAt: now,
    };
  }

  if (isActivityPendingBehavior(status.behavior)) {
    return {
      completedAt: null,
      cancelledAt: null,
    };
  }

  return {
    completedAt: null,
    cancelledAt: null,
  };
}

export function isActivityOverdue(
  activity: {
    dueDate: Date | null;
    archivedAt: Date | null;
  },
  statusBehavior: string | undefined,
  now: Date = new Date(),
): boolean {
  if (!activity.dueDate || activity.archivedAt) {
    return false;
  }

  if (
    isActivityCompletedBehavior(statusBehavior) ||
    isActivityCancelledBehavior(statusBehavior)
  ) {
    return false;
  }

  return activity.dueDate.getTime() < now.getTime();
}

export function isActivityUpcoming(
  activity: {
    dueDate: Date | null;
    archivedAt: Date | null;
  },
  statusBehavior: string | undefined,
  now: Date = new Date(),
): boolean {
  if (!activity.dueDate || activity.archivedAt) {
    return false;
  }

  if (!isActivityPendingBehavior(statusBehavior)) {
    return false;
  }

  return activity.dueDate.getTime() >= now.getTime();
}
