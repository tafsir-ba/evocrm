import "server-only";

import mongoose from "mongoose";

import {
  CAMPAIGN_ANALYTICS_AVAILABLE_FROM,
  evaluateCampaignDeliveryHealth,
  ratePercent,
  resolveAnalyticsPeriodDays,
  type CampaignAnalyticsPeriodPreset,
  type CampaignHealthResult,
} from "@/lib/campaign-analytics";
import { AppError } from "@/server/errors";
import { connectDb } from "@/server/db/mongoose";
import { CampaignSendModel } from "@/models/campaign-send";
import { CampaignEnrollmentModel } from "@/models/campaign-enrollment";
import { findCampaignById } from "@/server/repositories/campaigns";
import { findCampaignSteps } from "@/server/repositories/campaign-steps";
import { findWorkspaceById } from "@/server/repositories/workspaces";
import { resolveDashboardDateRange } from "@/server/utils/workspace-date-range";
import { withWorkspaceScope } from "@/server/workspaces/with-workspace-scope";
import { getEnv } from "@/server/env";

export type CampaignAnalyticsQuery = {
  period?: CampaignAnalyticsPeriodPreset;
  dateFrom?: Date;
  dateTo?: Date;
};

export type MetricCardData = {
  key: string;
  label: string;
  value: string;
  count: number;
  denominator: number | null;
  rate: number | null;
  hint: string;
  warning?: boolean;
  critical?: boolean;
  previousRate?: number | null;
  rateDelta?: number | null;
};

export type CampaignAnalyticsSeriesPoint = {
  date: string;
  sent: number;
  delivered: number;
  bounced: number;
  opened: number;
  clicked: number;
  complained: number;
};

export type CampaignStepAnalyticsRow = {
  stepId: string;
  order: number;
  name: string | null;
  subject: string;
  sent: number;
  delivered: number;
  deliveryRate: number | null;
  opened: number;
  openRate: number | null;
  clicked: number;
  clickRate: number | null;
  bounced: number;
  bounceRate: number | null;
  unsubscribed: number;
  complained: number;
  lastSentAt: string | null;
};

export type CampaignAnalyticsIssue = {
  id: string;
  leadId: string | null;
  leadName: string | null;
  emailMasked: string | null;
  stepId: string;
  stepOrder: number | null;
  stepSubject: string | null;
  issueType: "bounced" | "failed" | "complained" | "delayed";
  reason: string | null;
  eventAt: string;
};

export type CampaignAnalyticsReport = {
  campaign: {
    id: string;
    name: string;
    status: string;
    createdAt: string;
  };
  period: {
    preset: CampaignAnalyticsPeriodPreset | "custom";
    from: string;
    to: string;
    previousFrom: string;
    previousTo: string;
  };
  analyticsAvailableFrom: string;
  trackingConfigured: boolean;
  partialHistory: boolean;
  generatedAt: string;
  health: CampaignHealthResult;
  summary: {
    sent: number;
    delivered: number;
    bounced: number;
    opened: number;
    clicked: number;
    unsubscribed: number;
    complained: number;
    delayed: number;
    pending: number;
    failed: number;
    deliveryRate: number | null;
    bounceRate: number | null;
    openRate: number | null;
    clickRate: number | null;
    clickToOpenRate: number | null;
    unsubscribeRate: number | null;
    complaintRate: number | null;
  };
  cards: MetricCardData[];
  funnel: Array<{
    stage: string;
    count: number;
    fromPreviousRate: number | null;
    ofSentRate: number | null;
  }>;
  series: CampaignAnalyticsSeriesPoint[];
  steps: CampaignStepAnalyticsRow[];
  formulas: Record<string, string>;
};

function oid(id: string): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId(id);
}

function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

type SendAggRow = {
  sent: number;
  delivered: number;
  bounced: number;
  opened: number;
  clicked: number;
  complained: number;
  delayed: number;
  failed: number;
  pending: number;
};

async function aggregateSendMetrics(
  workspaceId: string,
  campaignId: string,
  from: Date,
  to: Date,
): Promise<SendAggRow> {
  await connectDb();

  const [row] = await CampaignSendModel.aggregate<SendAggRow>([
    {
      $match: {
        workspaceId: oid(workspaceId),
        campaignId: oid(campaignId),
        status: "sent",
        sentAt: { $gte: from, $lte: to },
      },
    },
    {
      $group: {
        _id: null,
        sent: { $sum: 1 },
        delivered: {
          $sum: { $cond: [{ $ne: ["$deliveredAt", null] }, 1, 0] },
        },
        bounced: {
          $sum: { $cond: [{ $ne: ["$bouncedAt", null] }, 1, 0] },
        },
        opened: {
          $sum: { $cond: [{ $ne: ["$firstOpenedAt", null] }, 1, 0] },
        },
        clicked: {
          $sum: { $cond: [{ $ne: ["$firstClickedAt", null] }, 1, 0] },
        },
        complained: {
          $sum: { $cond: [{ $ne: ["$complainedAt", null] }, 1, 0] },
        },
        delayed: {
          $sum: { $cond: [{ $ne: ["$deliveryDelayedAt", null] }, 1, 0] },
        },
        failed: {
          $sum: { $cond: [{ $ne: ["$providerFailedAt", null] }, 1, 0] },
        },
        pending: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$deliveredAt", null] },
                  { $eq: ["$bouncedAt", null] },
                  { $eq: ["$providerFailedAt", null] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);

  return (
    row ?? {
      sent: 0,
      delivered: 0,
      bounced: 0,
      opened: 0,
      clicked: 0,
      complained: 0,
      delayed: 0,
      failed: 0,
      pending: 0,
    }
  );
}

async function countUnsubscribesInRange(
  workspaceId: string,
  campaignId: string,
  from: Date,
  to: Date,
): Promise<number> {
  await connectDb();

  return CampaignEnrollmentModel.countDocuments(
    withWorkspaceScope(workspaceId, {
      campaignId,
      status: "unsubscribed",
      unsubscribedAt: { $gte: from, $lte: to },
    }),
  );
}

async function buildSeries(
  workspaceId: string,
  campaignId: string,
  from: Date,
  to: Date,
): Promise<CampaignAnalyticsSeriesPoint[]> {
  await connectDb();

  const days = Math.max(
    1,
    Math.ceil((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)),
  );
  const useWeekly = days > 60;

  const rows = await CampaignSendModel.aggregate<{
    _id: string;
    sent: number;
    delivered: number;
    bounced: number;
    opened: number;
    clicked: number;
    complained: number;
  }>([
    {
      $match: {
        workspaceId: oid(workspaceId),
        campaignId: oid(campaignId),
        status: "sent",
        sentAt: { $gte: from, $lte: to },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: {
            format: useWeekly ? "%G-W%V" : "%Y-%m-%d",
            date: "$sentAt",
          },
        },
        sent: { $sum: 1 },
        delivered: {
          $sum: { $cond: [{ $ne: ["$deliveredAt", null] }, 1, 0] },
        },
        bounced: {
          $sum: { $cond: [{ $ne: ["$bouncedAt", null] }, 1, 0] },
        },
        opened: {
          $sum: { $cond: [{ $ne: ["$firstOpenedAt", null] }, 1, 0] },
        },
        clicked: {
          $sum: { $cond: [{ $ne: ["$firstClickedAt", null] }, 1, 0] },
        },
        complained: {
          $sum: { $cond: [{ $ne: ["$complainedAt", null] }, 1, 0] },
        },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  return rows.map((row) => ({
    date: row._id,
    sent: row.sent,
    delivered: row.delivered,
    bounced: row.bounced,
    opened: row.opened,
    clicked: row.clicked,
    complained: row.complained,
  }));
}

async function buildStepRows(
  workspaceId: string,
  campaignId: string,
  from: Date,
  to: Date,
): Promise<CampaignStepAnalyticsRow[]> {
  const steps = await findCampaignSteps(workspaceId, campaignId);
  await connectDb();

  const rows = await CampaignSendModel.aggregate<{
    _id: mongoose.Types.ObjectId;
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    complained: number;
    lastSentAt: Date | null;
  }>([
    {
      $match: {
        workspaceId: oid(workspaceId),
        campaignId: oid(campaignId),
        status: "sent",
        sentAt: { $gte: from, $lte: to },
      },
    },
    {
      $group: {
        _id: "$campaignStepId",
        sent: { $sum: 1 },
        delivered: {
          $sum: { $cond: [{ $ne: ["$deliveredAt", null] }, 1, 0] },
        },
        opened: {
          $sum: { $cond: [{ $ne: ["$firstOpenedAt", null] }, 1, 0] },
        },
        clicked: {
          $sum: { $cond: [{ $ne: ["$firstClickedAt", null] }, 1, 0] },
        },
        bounced: {
          $sum: { $cond: [{ $ne: ["$bouncedAt", null] }, 1, 0] },
        },
        complained: {
          $sum: { $cond: [{ $ne: ["$complainedAt", null] }, 1, 0] },
        },
        lastSentAt: { $max: "$sentAt" },
      },
    },
  ]);

  const byStep = new Map(rows.map((row) => [row._id.toString(), row]));

  const unsubByStep = await CampaignEnrollmentModel.aggregate<{
    _id: number;
    count: number;
  }>([
    {
      $match: {
        workspaceId: oid(workspaceId),
        campaignId: oid(campaignId),
        status: "unsubscribed",
        unsubscribedAt: { $gte: from, $lte: to },
      },
    },
    { $group: { _id: "$currentStep", count: { $sum: 1 } } },
  ]);

  const unsubMap = new Map(unsubByStep.map((row) => [row._id, row.count]));

  return steps.map((step) => {
    const stats = byStep.get(step.id);
    const sent = stats?.sent ?? 0;
    const delivered = stats?.delivered ?? 0;
    const opened = stats?.opened ?? 0;
    const clicked = stats?.clicked ?? 0;
    const bounced = stats?.bounced ?? 0;
    const complained = stats?.complained ?? 0;

    return {
      stepId: step.id,
      order: step.order,
      name: step.name,
      subject: step.subject,
      sent,
      delivered,
      deliveryRate: ratePercent(delivered, sent),
      opened,
      openRate: ratePercent(opened, delivered),
      clicked,
      clickRate: ratePercent(clicked, delivered),
      bounced,
      bounceRate: ratePercent(bounced, sent),
      unsubscribed: unsubMap.get(step.order) ?? 0,
      complained,
      lastSentAt: stats?.lastSentAt?.toISOString() ?? null,
    };
  });
}

function buildCards(
  current: SendAggRow & { unsubscribed: number },
  previous: SendAggRow,
): MetricCardData[] {
  const deliveryRate = ratePercent(current.delivered, current.sent);
  const previousDelivery = ratePercent(previous.delivered, previous.sent);
  const bounceRate = ratePercent(current.bounced, current.sent);
  const openRate = ratePercent(current.opened, current.delivered);
  const clickRate = ratePercent(current.clicked, current.delivered);
  const unsubRate = ratePercent(current.unsubscribed, current.delivered);
  const complaintRate = ratePercent(current.complained, current.delivered);

  return [
    {
      key: "sent",
      label: "Emails sent",
      value: String(current.sent),
      count: current.sent,
      denominator: null,
      rate: null,
      hint: "Unique campaign sends accepted by Resend in this period",
    },
    {
      key: "delivery",
      label: "Delivery rate",
      value: deliveryRate === null ? "—" : `${deliveryRate}%`,
      count: current.delivered,
      denominator: current.sent,
      rate: deliveryRate,
      hint: `${current.delivered} of ${current.sent} emails delivered`,
      warning: deliveryRate !== null && deliveryRate < 95,
      critical: deliveryRate !== null && deliveryRate < 90,
      previousRate: previousDelivery,
      rateDelta:
        deliveryRate !== null && previousDelivery !== null
          ? Math.round((deliveryRate - previousDelivery) * 10) / 10
          : null,
    },
    {
      key: "bounce",
      label: "Bounce rate",
      value: bounceRate === null ? "—" : `${bounceRate}%`,
      count: current.bounced,
      denominator: current.sent,
      rate: bounceRate,
      hint: `${current.bounced} bounced of ${current.sent} sent`,
      warning: bounceRate !== null && bounceRate >= 2,
      critical: bounceRate !== null && bounceRate >= 5,
    },
    {
      key: "open",
      label: "Open rate",
      value: openRate === null ? "—" : `${openRate}%`,
      count: current.opened,
      denominator: current.delivered,
      rate: openRate,
      hint: "Unique opens ÷ delivered. Approximate due to privacy protections.",
    },
    {
      key: "click",
      label: "Click rate",
      value: clickRate === null ? "—" : `${clickRate}%`,
      count: current.clicked,
      denominator: current.delivered,
      rate: clickRate,
      hint: `${current.clicked} uniquely clicked of ${current.delivered} delivered`,
    },
    {
      key: "unsubscribe",
      label: "Unsubscribe rate",
      value: unsubRate === null ? "—" : `${unsubRate}%`,
      count: current.unsubscribed,
      denominator: current.delivered,
      rate: unsubRate,
      hint: "Campaign unsubscribes in this period ÷ delivered",
    },
    {
      key: "complaint",
      label: "Complaint rate",
      value: complaintRate === null ? "—" : `${complaintRate}%`,
      count: current.complained,
      denominator: current.delivered,
      rate: complaintRate,
      hint: `${current.complained} spam complaint${current.complained === 1 ? "" : "s"}`,
      warning: current.complained > 0,
      critical: complaintRate !== null && complaintRate >= 0.1,
    },
    {
      key: "pending",
      label: "Delivery pending",
      value: String(current.pending),
      count: current.pending,
      denominator: current.sent,
      rate: ratePercent(current.pending, current.sent),
      hint: `${current.delayed} also marked delayed by the provider`,
    },
  ];
}

export async function getCampaignAnalyticsForWorkspace(
  workspaceId: string,
  campaignId: string,
  query: CampaignAnalyticsQuery = {},
): Promise<CampaignAnalyticsReport> {
  const campaign = await findCampaignById(workspaceId, campaignId);

  if (!campaign) {
    throw new AppError("NOT_FOUND", "Campaign not found.");
  }

  const workspace = await findWorkspaceById(workspaceId);
  const timezone = workspace?.timezone ?? "UTC";
  const preset = query.period ?? "30d";
  const periodDays = resolveAnalyticsPeriodDays(preset);

  const range = resolveDashboardDateRange(
    {
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      periodDays: periodDays ?? undefined,
      timezone,
    },
    timezone,
  );

  // Default 30d, but if campaign is newer, clamp from to campaign createdAt.
  let from = range.from;
  if (preset !== "all" && !query.dateFrom && campaign.createdAt > from) {
    from = campaign.createdAt;
  }

  if (preset === "all") {
    from = campaign.createdAt < CAMPAIGN_ANALYTICS_AVAILABLE_FROM
      ? CAMPAIGN_ANALYTICS_AVAILABLE_FROM
      : campaign.createdAt;
  }

  if (from < CAMPAIGN_ANALYTICS_AVAILABLE_FROM) {
    from = CAMPAIGN_ANALYTICS_AVAILABLE_FROM;
  }

  const to = range.to;
  const durationMs = Math.max(to.getTime() - from.getTime(), 24 * 60 * 60 * 1000);
  const previousTo = new Date(from.getTime() - 1);
  const previousFrom = new Date(previousTo.getTime() - durationMs);

  const envConfigured = Boolean(getEnv().RESEND_WEBHOOK_SECRET);
  const [current, previous, unsubscribed, series, steps] = await Promise.all([
    aggregateSendMetrics(workspaceId, campaignId, from, to),
    aggregateSendMetrics(workspaceId, campaignId, previousFrom, previousTo),
    countUnsubscribesInRange(workspaceId, campaignId, from, to),
    buildSeries(workspaceId, campaignId, from, to),
    buildStepRows(workspaceId, campaignId, from, to),
  ]);

  const health = evaluateCampaignDeliveryHealth({
    sent: current.sent,
    delivered: current.delivered,
    bounced: current.bounced,
    complained: current.complained,
    failed: current.failed,
  });

  const cards = buildCards({ ...current, unsubscribed }, previous);

  return {
    campaign: {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      createdAt: campaign.createdAt.toISOString(),
    },
    period: {
      preset: query.dateFrom && query.dateTo ? "custom" : preset,
      from: from.toISOString(),
      to: to.toISOString(),
      previousFrom: previousFrom.toISOString(),
      previousTo: previousTo.toISOString(),
    },
    analyticsAvailableFrom: CAMPAIGN_ANALYTICS_AVAILABLE_FROM.toISOString(),
    trackingConfigured: envConfigured,
    partialHistory: campaign.createdAt < CAMPAIGN_ANALYTICS_AVAILABLE_FROM,
    generatedAt: new Date().toISOString(),
    health,
    summary: {
      sent: current.sent,
      delivered: current.delivered,
      bounced: current.bounced,
      opened: current.opened,
      clicked: current.clicked,
      unsubscribed,
      complained: current.complained,
      delayed: current.delayed,
      pending: current.pending,
      failed: current.failed,
      deliveryRate: ratePercent(current.delivered, current.sent),
      bounceRate: ratePercent(current.bounced, current.sent),
      openRate: ratePercent(current.opened, current.delivered),
      clickRate: ratePercent(current.clicked, current.delivered),
      clickToOpenRate: ratePercent(current.clicked, current.opened),
      unsubscribeRate: ratePercent(unsubscribed, current.delivered),
      complaintRate: ratePercent(current.complained, current.delivered),
    },
    cards,
    funnel: [
      {
        stage: "Sent",
        count: current.sent,
        fromPreviousRate: null,
        ofSentRate: ratePercent(current.sent, current.sent),
      },
      {
        stage: "Delivered",
        count: current.delivered,
        fromPreviousRate: ratePercent(current.delivered, current.sent),
        ofSentRate: ratePercent(current.delivered, current.sent),
      },
      {
        stage: "Opened",
        count: current.opened,
        fromPreviousRate: ratePercent(current.opened, current.delivered),
        ofSentRate: ratePercent(current.opened, current.sent),
      },
      {
        stage: "Clicked",
        count: current.clicked,
        fromPreviousRate: ratePercent(current.clicked, current.opened),
        ofSentRate: ratePercent(current.clicked, current.sent),
      },
      {
        stage: "Unsubscribed",
        count: unsubscribed,
        fromPreviousRate: ratePercent(unsubscribed, current.delivered),
        ofSentRate: ratePercent(unsubscribed, current.sent),
      },
    ],
    series,
    steps,
    formulas: {
      deliveryRate: "unique delivered / unique sent × 100",
      bounceRate: "unique bounced / unique sent × 100",
      openRate: "unique opened / unique delivered × 100",
      clickRate: "unique clicked / unique delivered × 100",
      clickToOpenRate: "unique clicked / unique opened × 100",
      unsubscribeRate: "campaign unsubscribes / unique delivered × 100",
      complaintRate: "unique complained / unique delivered × 100",
    },
  };
}

export async function listCampaignAnalyticsIssuesForWorkspace(
  workspaceId: string,
  campaignId: string,
  input: {
    from: Date;
    to: Date;
    page?: number;
    pageSize?: number;
  },
): Promise<{ issues: CampaignAnalyticsIssue[]; total: number }> {
  const campaign = await findCampaignById(workspaceId, campaignId);

  if (!campaign) {
    throw new AppError("NOT_FOUND", "Campaign not found.");
  }

  await connectDb();

  const page = input.page ?? 1;
  const pageSize = Math.min(input.pageSize ?? 25, 100);
  const skip = (page - 1) * pageSize;

  const match = {
    workspaceId: oid(workspaceId),
    campaignId: oid(campaignId),
    status: "sent",
    sentAt: { $gte: input.from, $lte: input.to },
    $or: [
      { bouncedAt: { $ne: null } },
      { providerFailedAt: { $ne: null } },
      { complainedAt: { $ne: null } },
      { deliveryDelayedAt: { $ne: null } },
    ],
  };

  const [total, docs] = await Promise.all([
    CampaignSendModel.countDocuments(match),
    CampaignSendModel.find(match)
      .sort({ lastProviderEventAt: -1, sentAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean(),
  ]);

  const steps = await findCampaignSteps(workspaceId, campaignId);
  const stepMap = new Map(steps.map((step) => [step.id, step]));

  const leadIds = [
    ...new Set(
      docs
        .map((doc) => doc.leadId?.toString())
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const { findLeadsByIds } = await import("@/server/repositories/leads");
  const leads = await findLeadsByIds(workspaceId, leadIds);
  const leadMap = new Map(leads.map((lead) => [lead.id, lead]));

  const issues: CampaignAnalyticsIssue[] = docs.map((doc) => {
    const step = stepMap.get(doc.campaignStepId.toString());
    const lead = doc.leadId ? leadMap.get(doc.leadId.toString()) : null;
    let issueType: CampaignAnalyticsIssue["issueType"] = "delayed";
    let eventAt = doc.deliveryDelayedAt ?? doc.sentAt ?? doc.createdAt;
    let reason = doc.providerError ?? null;

    if (doc.complainedAt) {
      issueType = "complained";
      eventAt = doc.complainedAt;
      reason = "Spam complaint";
    } else if (doc.bouncedAt) {
      issueType = "bounced";
      eventAt = doc.bouncedAt;
    } else if (doc.providerFailedAt) {
      issueType = "failed";
      eventAt = doc.providerFailedAt;
    }

    return {
      id: doc._id.toString(),
      leadId: lead?.id ?? null,
      leadName: lead?.fullName ?? null,
      emailMasked: maskEmail(lead?.email),
      stepId: doc.campaignStepId.toString(),
      stepOrder: step?.order ?? null,
      stepSubject: step?.subject ?? null,
      issueType,
      reason,
      eventAt: eventAt.toISOString(),
    };
  });

  return { issues, total };
}
