export type LeadActivityEvent = {
  id: string;
  title: string;
  at: Date;
};

export type LeadActivityTimeline = {
  lastActivity: LeadActivityEvent | null;
  nextAction: LeadActivityEvent | null;
};

export type LeadActivitySummaryInput = {
  id: string;
  leadId: string | null;
  title: string;
  dueDate: Date | null;
  nextActionDate: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  updatedAt: Date;
  createdAt: Date;
};

function eventAt(left: Date, right: Date): number {
  return left.getTime() - right.getTime();
}

function nextActionAt(activity: LeadActivitySummaryInput): Date | null {
  if (activity.completedAt || activity.cancelledAt) {
    return null;
  }

  return activity.dueDate ?? activity.nextActionDate ?? null;
}

export function summarizeLeadActivities(
  activities: LeadActivitySummaryInput[],
): Map<string, LeadActivityTimeline> {
  const grouped = new Map<string, LeadActivitySummaryInput[]>();

  for (const activity of activities) {
    if (!activity.leadId) {
      continue;
    }

    const existing = grouped.get(activity.leadId);
    if (existing) {
      existing.push(activity);
    } else {
      grouped.set(activity.leadId, [activity]);
    }
  }

  const summaries = new Map<string, LeadActivityTimeline>();

  for (const [leadId, items] of grouped) {
    let lastActivity: LeadActivityEvent | null = null;
    let nextAction: LeadActivityEvent | null = null;

    for (const activity of items) {
      const lastAt = activity.updatedAt ?? activity.createdAt;
      if (!lastActivity || eventAt(lastAt, lastActivity.at) > 0) {
        lastActivity = {
          id: activity.id,
          title: activity.title,
          at: lastAt,
        };
      }

      const upcomingAt = nextActionAt(activity);
      if (upcomingAt && (!nextAction || eventAt(upcomingAt, nextAction.at) < 0)) {
        nextAction = {
          id: activity.id,
          title: activity.title,
          at: upcomingAt,
        };
      }
    }

    summaries.set(leadId, { lastActivity, nextAction });
  }

  return summaries;
}
